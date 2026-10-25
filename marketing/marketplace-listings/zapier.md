# Zapier App Directory: listing draft

**Status: draft, everything on the Salsox side exists; not submitted (updated 2026-10-25).** Zapier publishes only integrations built on its Developer Platform that pass review. The Salsox side is complete for a full first version: API-key authentication, REST-hook subscribe and unsubscribe endpoints with sample data for each trigger, webhooks for seven document events, and since the second update on 2026-10-25 an API to send documents and to find them, so the actions and the search below can be built too, not only triggers. Still to do: build the integration in the Zapier Developer Platform, test it privately with real users, and capture the screenshots. See "Ready to submit?" below.

## Ready to submit? (checked 2026-10-25)

**Not as-is.** Zapier reviews an integration built on its own platform; this file is the plan for that build, not something Zapier accepts by itself. What is done and what is not:

| | State |
|---|---|
| API-key auth, `GET /api/v1/me` for the connection test and label | Done, live |
| REST-hook subscribe / unsubscribe (`target_url` + `event`, `DELETE` by id) | Done, live |
| Seven trigger events, signed, retried, logged | Done, live; verified end to end (below) |
| Perform list with the user's real recent events | Done (`GET /api/v1/events`), live with the commit that adds it |
| Actions (send PDF, send template) and search (find document) | Done on the Salsox side, live |
| The integration itself on the Zapier Developer Platform | **Not started.** Define auth, the seven triggers, two actions and one search from the sections below, in the Platform UI or with the Zapier CLI |
| Private testing with real accounts | **Not done.** Invite a few customers to the private integration and keep their Zaps running; check Zapier's current requirement for live users before requesting publication |
| Screenshots, Zap templates, a reviewer test account | **Not done.** Lists below |
| Public setup guide | `/integrations/zapier` exists but describes the webhook route; rewrite it when the integration is approved (see the last section) |

A triggers-only first version is possible and is the fastest route: everything it needs is live. The actions and search can follow as an update.

**Verified end to end on 2026-10-25** (`e2e/webhooks-api.spec.ts`, against Postgres with a real receiver): an API key made on the Developers page; a REST-hook subscription for five events; two documents sent through `POST /api/v1/documents`; a real signer viewed and signed one on a phone, another declined the other. Exactly seven deliveries arrived (sent twice, viewed twice, signed, completed, declined), each about the right document and recipient, each with a unique id and a signature that checks out under the published algorithm. `GET /api/v1/events` returned the same history. That run found and fixed a bug that would have hurt a Zap: one signature sent **two** `document.signed` webhooks, the first with the signer still unsigned (`src/lib/esign/audit.ts`). `document.expired` and `payment.sent` come from the same builder and are covered by unit tests, not by that run.

## What the platform provides (for the Zapier build)

- **Authentication:** API key. Zapier's "API Key" auth with the key sent as `Authorization: Bearer {{bundle.authData.api_key}}`. Test request: `GET /api/v1/me`, whose `email` makes a good connection label.
- **Triggers (REST hooks):** subscribe with `POST /api/v1/webhooks` and body `{ "target_url": "{{bundle.targetUrl}}", "event": "document.completed" }`, store the returned `id`; unsubscribe with `DELETE /api/v1/webhooks/{{bundle.subscribeData.id}}`; "perform list" with `GET /api/v1/events?event=document.completed&limit=3`, which returns the account's latest real events of that kind in exactly the shape a webhook delivers (Zapier asks that a trigger's test step show the user's own data), and when it returns `[]` (a new account), fall back to `GET /api/v1/webhooks/sample?event=document.completed`, a sample marked `"test": true`. Every item has a unique `id`, which Zapier uses to de-duplicate.
- **Actions:** `POST /api/v1/documents` with a JSON body (see the action table below for the input fields each one maps). Answers `201` with the document; a refusal is `{ "error": { "code", "message" } }`, which the integration should raise as a Zapier error with the message, since it is written for the person (for example "Confirm your email address before sending").
- **Dynamic dropdown for templates:** `GET /api/v1/templates` returns `data` (library templates: `slug`, `title`, `roles`, `variables`) and `saved` (the account's saved templates: `id`, `name`, `template`). Use it for the Template field, and its `roles` and `variables` for dynamic input fields (one email and name per role that is not `sender`, one text field per variable).
- **Search:** `GET /api/v1/documents?title=&recipient=&status=&limit=1`, returning `{ data: [...] }`; a document is the webhook's `data.document` with its `recipients`, so trigger and search outputs map the same way. `GET /api/v1/documents/{id}` for a lookup by id.
- **Payload and fields:** documented at `/resources/help/webhooks-and-api`. Each delivery is signed; the Zapier integration does not need to check it (Zapier's hook URL is secret), but may.
- Base URL: the production app URL plus `/api/v1`.

Requirements source: [Zapier integration publishing requirements](https://docs.zapier.com/platform/publish/integration-publishing-requirements), [branding guidelines](https://docs.zapier.com/platform/publish/branding-guidelines), [build guidelines](https://docs.zapier.com/platform/publish/integration-build-guidelines).

## Branding fields

**Name:** Salsox

**Logo:** `assets/logo-512.png` (square, transparent PNG, 512 x 512, mark only, no text).

**Description** (160 characters at most; Zapier asks for the form "Name is a..."):

> Salsox is an e-signature app built for phones: send PDFs to sign by email, WhatsApp or SMS, track every signature, and collect payment as people sign.

(150 characters.)

**Category:** Signatures (fallback: Documents)

**Audience:** Small businesses, freelancers and sales teams.

**Role:** Employee of the company that owns the app.

## Planned triggers

| Trigger | Description shown in Zapier | Type | Webhook event |
|---|---|---|---|
| Document Completed | Triggers when everyone has signed a document. Includes the title, signers and a link to the document. | Instant | `document.completed` |
| Document Signed by Recipient | Triggers each time one recipient signs a document. | Instant | `document.signed` |
| Document Viewed | Triggers the first time a recipient opens a document. | Instant | `document.viewed` |
| Document Sent | Triggers when a document goes out for signature. | Instant | `document.sent` |
| Document Declined | Triggers when a recipient declines to sign, with their reason. | Instant | `document.declined` |
| Document Expired | Triggers when a document's signing links expire before everyone has signed. | Instant | `document.expired` |
| Payment Received | Triggers when a signer pays through Sign & Pay. | Instant | `payment.sent` |

All seven are available today. "Includes a link to the signed PDF" is not promised: the payload links to the document page, not the PDF file.

## Planned actions (the API exists; build them)

| Action | Description | Request |
|---|---|---|
| Send Template for Signature | Sends a template from the library, or one of your saved templates, to new recipients, with its blanks filled from earlier steps. | `POST /api/v1/documents` with `template` (slug) or `saved_template_id`, `values` from the dynamic fields, and one recipient per role (`template_role`). |
| Send PDF for Signature | Sends a PDF from a previous step, such as Google Drive or Gmail, for signature, with a signature and a date placed for each signer automatically. | `POST /api/v1/documents` with `file_url` set to the Zapier file field, `title`, and `recipients` (line items: email, name). Optional `message`, `expires_in_days`. |

Notes for the build:

- **Files.** Map Zapier's file field straight to `file_url`. Salsox downloads it over https, follows up to three redirects (Zapier's file links redirect to storage) and refuses private addresses; PDFs up to 4 MB. Check in private testing that a file from Google Drive and from Gmail both arrive. The alternative, a multipart upload (`file` part plus the JSON as a `data` part), also works and needs custom code in the integration.
- **Fields are placed automatically** only for signers in parallel. "Send PDF for Signature" should not offer approvers, copies or a signing order unless it also asks for field positions, which a Zap user cannot sensibly give; leave them out of the first version. Templates have their fields placed already, so "Send Template for Signature" has no such limit.
- **Plan limits come back as `402`**, with a message the user can act on (upgrade, or remove the setting).

## Planned search (the API exists; build it)

| Search | Description | Request |
|---|---|---|
| Find Document | Finds the newest document matching a title, a recipient's email or a status, for use in later steps. | `GET /api/v1/documents?title=…&recipient=…&status=…&limit=1` |

## Example Zap descriptions (for the Zap templates Zapier asks for)

Template 1 needs what is not built yet (the signed PDF as a file); 2 to 5 work with the triggers and actions above.

1. **Save signed Salsox documents to Google Drive.** When a document is completed in Salsox, upload the signed PDF to a Google Drive folder.
2. **Post to Slack when a contract is signed.** When a document is completed in Salsox, send a message to a Slack channel with its title and signers.
3. **Send a Salsox agreement for every new HubSpot deal.** When a deal reaches a chosen stage in HubSpot, send a Salsox template to the contact.
4. **Log Salsox payments in Google Sheets.** When a payment is received in Salsox, add a row with the amount, payer and document.
5. **Chase declined documents.** When a recipient declines in Salsox, create a task in Asana for the document's owner.

## Screenshots and testing to prepare

- The connection screen in Zapier (authentication) and one Zap built from each trigger above, for review.
- Test accounts for Zapier's reviewers, with sample documents and a template.

## Help article (needed before submission)

A public page at `/integrations/zapier` already exists, and since 2026-10-25 it shows the Webhooks by Zapier route that works today. When the integration ships, rewrite it from "in development" to the real setup: connect your account, pick a trigger, and the example Zaps above. Update `integration.status` in `content/pages/integrations/zapier.md` to `works-today` in the same change.
