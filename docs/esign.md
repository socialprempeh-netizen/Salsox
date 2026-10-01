# E-signatures (Salsox)

How the signing engine is built, where each piece lives, and how to configure it.

## Where it came from

The e-signature engine is a **clean-room implementation**. [Documenso](https://github.com/documenso/documenso) was studied as a reference for the problem's shape: per-recipient tokens, signing order, fields stored as page percentages, an append-only audit trail and a sealed PDF with a certificate. None of its code is used. Documenso is AGPL-3.0 (and its `ee/` folder is under a commercial licence), and copying it would oblige Salsox to publish its full source.

Every library the engine uses is permissively licensed:

| Library | Licence | Used for |
|---|---|---|
| `pdf-lib` | MIT | reading uploads, stamping fields, the certificate page |
| `pdfjs-dist` | Apache-2.0 | rendering pages in the browser |
| `perfect-freehand` | MIT | drawn signatures |
| `@signpdf/*` | MIT | the optional PKCS#7 digital seal |
| `@vercel/blob` | Apache-2.0 | private file storage |
| `jszip` | MIT (dual-licensed MIT/GPL) | the export-everything ZIP |
| `nanoid` | MIT | signing-link tokens |

## Layout

```
src/lib/esign/
  rules.ts          the state machine, pure functions (rules.test.ts)
  schemas.ts        input shapes shared by forms and actions
  documents.ts      upload, setup, send, Quick Send, renew, cancel, finalize, sweeps
  recipients.ts     correct a recipient in place (token rotation), resend
  sending-limits.ts who may send and how much, pure functions (sending-limits.test.ts)
  sender.ts         loads a sender's standing for those rules
  signing.ts        signer operations by token, Sign & Pay start/confirm
  renewal.ts        advance notice before every subscription renewal
  audit.ts          append-only audit events
  storage.ts        Vercel Blob (private) or .data/storage locally
  tokens.ts, share.ts, files.ts, quick-send.ts, emails.ts
  pdf/              inspect.ts (upload checks), signature-image.ts (signature checks), coords.ts, seal.ts
  payments/         types.ts (interface), stripe.ts, paystack.ts, select.ts, index.ts
src/app/actions/    documents.ts, signing.ts, payouts.ts, billing.ts
src/app/sign/[token]/            public signing page, file and download routes
src/app/(dashboard)/dashboard/   documents/, documents/quick-send, documents/[id](/edit), payouts
src/app/api/        documents/[id]/[variant], export, webhooks/paystack, cron/esign
src/components/esign/            pdf-pages, signing-wizard, signature-pad, document-editor, …
```

The rule from `AGENTS.md` holds: decisions live in `src/lib/esign` as functions with tests beside them; components render; server actions authenticate, re-parse and translate errors.

## Lifecycle

`DRAFT → PENDING → COMPLETED`, with `REJECTED`, `CANCELLED` and `EXPIRED` as exits. `EXPIRED` is revivable.

1. **Upload.** `inspectPdf` checks magic bytes, parseability, encryption and the 4 MB limit (under Vercel's 4.5 MB body limit). The original is stored once and never modified.
2. **Setup.** Recipients (signer, approver, viewer, CC), fields as page percentages, signing order, expiry, optional Sign & Pay.
3. **Send.** Recipients get an expiry and an email with their link. Every link can also be copied, or shared over WhatsApp (`wa.me`) and SMS (`sms:`), from the document page. "Sent" is only shown for an email the provider accepted: every send in `emails.ts` returns `sent`, `notConfigured` (no Resend key, links are shared by hand) or `failed`, and a recipient's `sentAt` is written on success only. A refused invitation leaves the document live, replaces the "Sent!" banner with a warning naming how many were not delivered, marks those recipients "Email not delivered", and a refused reminder or resend is reported as an error with a retry. With no email provider configured, nothing claims delivery either: `sentAt` stays empty, the page shows "Email isn't configured: share the signing links manually" in place of the "Sent!" banner, the recipients are marked "Share link manually", and a reminder or resend is refused with the same advice instead of being recorded as sent.
4. **Sign.** Each field is saved as it is filled. A drawn or uploaded signature is checked before it is stored (`signature-image.ts`): the PNG or JPEG must be whole, of a sane size, and embeddable by pdf-lib, or the signer is asked to draw it again. This matters because pdf-lib loops forever on a damaged PNG, so a bad image that got stored would stop the document from ever being sealed; the sealer runs the same structural check and fails with an error instead of hanging. `completeSigning` refuses while required fields are empty or a payment is outstanding.
5. **Finalize.** When the last signer completes, `finalizeDocument` stamps the fields, flattens forms, appends a certificate page (hashes, recipients, the full audit trail including the completion event), optionally applies a digital signature and stores the sealed copy under a key named by its own SHA-256. Then **one transaction** commits the `COMPLETED` status, the `DOCUMENT_COMPLETED` audit event, the sealed key and its fingerprint, and only after that is everyone emailed. Two last signers finishing together both build a seal, but only one commit can claim the document: the other rolls back and deletes its upload, so the stored file is always the one whose hash is recorded and the audit log has a single completion. The commit is also refused if an audit event arrived after the certificate was printed, and the seal is rebuilt. A signature and its `RECIPIENT_SIGNED` event are themselves written in one transaction.
6. **Recovery.** A failure anywhere before that commit leaves the document `PENDING` with every signer done, and nothing half-written. `recoverStuckFinalizations` (the daily cron) finishes such documents once their last signature is more than 5 minutes old (`FINALIZE_GRACE_MS` in `rules.ts`), and the owner's document page does the same after its response, so the owner rarely waits for the cron. A document the earlier two-step version left `COMPLETED` without a sealed copy is finished the same way.

In a sequential document, the next signer is claimed (a guarded write of `sentAt`) before their "your turn" email goes out, so two signers of the same group finishing together send it once. The claim is released if the email does not go. `src/lib/esign/finalize-concurrency.db.test.ts` races all of this against a real database (`ESIGN_DB_TESTS=1`).

## The DocuSign fixes

- **Unlimited sending.** No plan has an envelope cap and nothing reads the subscription when sending. What applies to every account alike is abuse protection, in `sending-limits.ts`:
  - **A confirmed sender.** The sender's own email must be confirmed before anything that emails recipients: send, Quick Send, remind, renew, resend, and correcting an address. It is enforced when `RESEND_API_KEY` is set; without it no confirmation email can be sent and no invite leaves the server, so the rule is off. Unconfirmed senders see a notice on the Documents pages with a button to send the link again.
  - **10 recipients per document.**
  - **A daily ceiling**, counted from the database over a rolling 24 hours: 100 documents and 300 recipients, or 10 and 30 during an account's first 7 days.
  - **Burst limits** in the actions: 10 sends and 30 uploads per 10 minutes per user, 3 reminders or renewals per hour per document, 10 recipient corrections per hour per user, 5 resends per hour per recipient. These use the shared rate limiter, which is per instance until `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.
- **Correct or renew without rebuilding.** Fields hang off the recipient row, so `updateRecipient` edits it in place and **rotates the token**: the link sent to a wrong address stops working immediately. `renewDocument` extends every unsigned link and revives an `EXPIRED` document; the tokens are kept, so links already shared work again.
- **Mobile-first signing.** One field at a time, a sticky next-action bar, bottom-sheet inputs sized for thumbs, a remembered signature, and no horizontal scroll at 360px (covered by `e2e/responsive.spec.ts`).
- **Sign & Pay.** Stripe (Connect destination charges) or Paystack (subaccounts) sit behind one `SignAndPayProvider` interface. A payment is always verified with the provider's API, never trusted from a webhook body or return URL alone, and amount and currency must match. Once paid, signing completes automatically.
- **Quick Send.** PDF + emails → sent. A signature and a date field are placed for each signer (`quick-send.ts`).
- **Honest billing.**
  - Cancel and undo in-app, not only in the Stripe portal.
  - The renewal date is shown on the billing page.
  - An email goes out 7 days (monthly) or 14 days (yearly) before every renewal.
  - `/api/export` streams a ZIP of every original, sealed PDF and audit trail, on any plan and after cancelling.

## Configuration

| Variable | Needed for |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | Production file storage. **Required in production.** In development, without it, files go to `.data/storage`. |
| `CRON_SECRET` | `/api/cron/esign` (expiry, reminders, recovery of stuck finalizations, renewal notices). Runs daily per `vercel.json`. **Required in production.** |
| `RESEND_API_KEY`, `EMAIL_FROM` | Emails. **Required in production.** In development, without them, signing links are logged, and can still be shared from the dashboard. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Sign & Pay through Stripe. Also enable Connect, and add `account.updated` to the webhook's events. |
| `PAYSTACK_SECRET_KEY`, `PAYSTACK_COUNTRY` | Sign & Pay through Paystack. Point a webhook at `/api/webhooks/paystack`. Country defaults to `ghana`. |
| `SIGN_AND_PAY_FEE_BPS` | Optional platform fee in basis points (150 = 1.5%). Defaults to 0. |
| `SIGNING_P12_BASE64`, `SIGNING_P12_PASSPHRASE` | Optional digital seal: a base64 PKCS#12 certificate. Without it, PDFs are sealed with the certificate page and SHA-256 hashes, but no cryptographic signature. |

## Known limits

- PDFs are capped at 4 MB. Larger files need a direct browser-to-Blob upload.
- Typed signatures and text use the standard PDF fonts, so characters outside Latin-1 are replaced when stamped. Embed a Unicode font in `pdf/seal.ts` to lift this.
- Rotated PDF pages are stamped in unrotated coordinates.
- The digital seal is PKCS#7 (`adbe.pkcs7.detached`), not PAdES-LTV with a timestamp authority.
