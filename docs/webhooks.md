# Webhooks and the API

Each account can send its document events to other software as signed JSON, and integrations (Zapier, Make, HubSpot) can subscribe to them, and send and find documents, with an API key. This guide is how it is built and what to configure. The public reference for people receiving webhooks is the Help Center article `content/help/articles/webhooks-and-api.md`, served at `/resources/help/webhooks-and-api`.

## Where things are

| Piece | File |
|---|---|
| Events, and which engine event each comes from | `src/lib/webhooks/events.ts` |
| Payload, sample payloads, signing and verifying | `src/lib/webhooks/payload.ts` |
| Which URLs may be called (SSRF rules) | `src/lib/webhooks/url-safety.ts` |
| Retry schedule | `src/lib/webhooks/retry.ts` |
| Secret encryption at rest | `src/lib/webhooks/secret-box.ts` |
| HTTP sending (connect-time IP check, no redirects) | `src/lib/webhooks/deliver.ts` |
| Endpoints, queuing, attempts, retries, tests | `src/lib/webhooks/store.ts` |
| API keys | `src/lib/api-keys.ts`, `src/lib/api-keys-store.ts` |
| Public API routes | `src/app/api/v1/` with `src/lib/api/v1.ts` |
| Reading a send request or a search (pure) | `src/lib/api/documents.ts` |
| Finding documents | `src/lib/api/documents-store.ts` |
| Downloading a `file_url` (same SSRF rules as webhooks) | `src/lib/api/fetch-file.ts` |
| Sending from the API, in the engine | `src/lib/esign/api-send.ts` |
| Developers page | `src/app/(dashboard)/dashboard/developers/page.tsx`, `src/components/developers/` |

## Events

`document.sent`, `document.viewed`, `document.signed`, `document.completed`, `payment.sent`, `document.declined` and `document.expired`. Each is an audit event the signing engine already records once per occurrence (`src/lib/esign/audit.ts`), so webhooks need no de-duplication of their own.

`recordAudit` queues the webhook straight after writing the audit row when it runs outside a transaction. Inside one (a signature, a completion) the event could still roll back, so the caller queues after the commit (`signing.ts`, `documents.ts`). Queuing never throws: a webhook problem must not stop a signature. A crash in the instant between the commit and the queue would lose that one webhook; the delivery log would simply not show it.

## Delivery

Each subscribed endpoint gets a `WebhookDelivery` row with the payload fixed at that moment. It is sent after the response (`next/server` `after`), so the person signing never waits on someone else's server. An attempt claims the row first, so the cron, a new event and a manual Resend cannot send the same delivery twice.

Anything but a 2xx within 10 seconds is a failure, retried after about 1 minute, 5 minutes, 30 minutes, 2 hours, 12 hours and 24 hours, then marked failed. Retries run from the daily `/api/cron/esign` (step `webhooks`). **On a plan with daily crons only, a retry can wait up to a day longer than its delay.** A cron every few minutes on the same route, or a dedicated one calling `deliverDue()`, makes retries prompt.

## Security

- **SSRF.** Users type the URL and our server calls it. URLs must be https (http to localhost is allowed in development only), with no credentials and no privileged port. At connect time every resolved address is checked, so a public name pointing at a private, loopback or link-local address (cloud metadata at 169.254.169.254) is refused even if its DNS changes after the URL check. Redirects are never followed.
- **Signatures.** `Webhook-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`, with a per-endpoint secret shown once. Receivers should refuse timestamps older than five minutes.
- **Secrets at rest.** The server must read secrets to sign, so they are AES-256-GCM encrypted with a key derived from `AUTH_SECRET`. Changing `AUTH_SECRET` makes them unreadable: deliveries then fail with a message to rotate the secret on the Developers page.
- **API keys** are `ak_` plus 40 random characters, stored as SHA-256 only, shown once, revocable. Each key is limited to 120 requests a minute.
- **Payloads** never include signing tokens (each opens a document), phone numbers or IP addresses.

## The API

Authenticated with `Authorization: Bearer ak_…`, 120 requests a minute per key. Errors are `{ "error": { "code", "message" } }`.

| Request | Does |
|---|---|
| `GET /api/v1/me` | The key's account: integrations call it to test a key. |
| `GET`, `POST /api/v1/webhooks`, `DELETE /api/v1/webhooks/{id}` | Subscriptions, in the REST-hook pattern Zapier and Make use for instant triggers. |
| `GET /api/v1/webhooks/sample?event=` | A sample payload for an event. |
| `POST /api/v1/documents` | Creates and sends a document, from a PDF or a template. |
| `GET /api/v1/documents` | Finds documents: `status`, `recipient`, `title`, `created_after`, `created_before`, `limit` (up to 100), `cursor`. |
| `GET /api/v1/documents/{id}` | One document. |
| `GET /api/v1/templates` | The library's templates (roles and blanks) and the account's saved ones. |

Documents come back in the webhook payload's shape (`documentResource` in `payload.ts`): the document's fields with a `recipients` array. One shape for what a webhook delivers and what a search finds, so an integration maps them once.

### Sending

`POST /api/v1/documents` takes JSON, or `multipart/form-data` with a `file` part and the same JSON as a `data` part. The source is exactly one of a `file` part, `file_url`, `file_base64`, `template` (a library slug) or `saved_template_id`, with `values` for a template's blanks. Then `recipients` (`email`, `name`, `role`, `order`, `template_role`), optional `fields` (`recipient` as a position or an email, `type`, `page`, `x`, `y`, `width`, `height` as page percentages), `title`, `message`, `expires_in_days` and `signing_order`.

It is not a second send path. `sendFromApi` picks one the product already has, so the plan rules, the sender checks, the audit trail and the webhooks (`document.sent` through `recordAudit`) are the dashboard's:

- a PDF to signers in parallel without fields goes through Quick Send (`quickSend`), which places a signature and a date for each;
- a PDF with fields, approvers, viewers, copies or a signing order goes through the editor's `createDraftFromUpload`, `saveDocumentSetup`, `sendDocument`. Without fields it is refused with `fields_required`, as the engine does not guess where an approver signs;
- a template goes through `createDraftFromTemplate`, then the editor's path with the people filled in. The sender's own role (`you`) is the key's account; other roles are filled by `template_role`, or in order.

When the draft was made but the send is refused (an unconfirmed email, a plan rule), the draft is deleted, so a failed call leaves nothing behind. Requests also spend the dashboard's own burst buckets (`esign:send:<user>`, `esign:upload:<user>`), so the API is not a way around them. A refusal carries the engine's code and the dashboard's English message for it; plan limits are 402.

**Files.** The PDF limit is the dashboard's (4 MB). A Vercel function takes at most 4.5 MB of body, so a PDF near the limit fits as a multipart upload or a `file_url`, not as base64. `file_url` is fetched under the webhook rules: https only, every resolved address checked at connect time, up to three redirects (Zapier's file links redirect to storage), each hop checked again, 10 seconds, and the body read no further than the size limit.

## Configuration

Nothing new: webhooks use `AUTH_SECRET` (already required) and the app URL (`NEXT_PUBLIC_APP_URL`) for the document links in payloads. Apply the migration `20261025180000_webhooks_api_keys`.
