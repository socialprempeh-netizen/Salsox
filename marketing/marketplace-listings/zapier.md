# Zapier App Directory: listing draft

**Status: draft, closer but not submittable yet (updated 2026-10-25).** Zapier publishes only integrations built on its Developer Platform that pass review. The Salsox side now exists: API-key authentication, REST-hook subscribe and unsubscribe endpoints, sample data for each trigger, and webhooks for seven document events (see "What the platform provides" below). Still to do: build the integration in the Zapier Developer Platform with the triggers below, test it privately with real users, and capture the screenshots. The actions and the search need an API to send and find documents, which does not exist yet, so the first version would be triggers only; confirm in Zapier's current publishing requirements that a triggers-only integration is accepted before building.

## What the platform provides (for the Zapier build)

- **Authentication:** API key. Zapier's "API Key" auth with the key sent as `Authorization: Bearer {{bundle.authData.api_key}}`. Test request: `GET /api/v1/me`, whose `email` makes a good connection label.
- **Triggers (REST hooks):** subscribe with `POST /api/v1/webhooks` and body `{ "target_url": "{{bundle.targetUrl}}", "event": "document.completed" }`, store the returned `id`; unsubscribe with `DELETE /api/v1/webhooks/{{bundle.subscribeData.id}}`; "perform list" (sample data) with `GET /api/v1/webhooks/sample?event=document.completed`.
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

## Planned actions (later: need an API to send documents)

| Action | Description |
|---|---|
| Send Template for Signature | Sends one of your saved templates to a new recipient, with their name and email filled in. |
| Send PDF for Signature | Sends a PDF from a previous step, such as Google Drive or Gmail, for signature with fields placed automatically. |

## Planned searches (later: need an API to find documents)

| Search | Description |
|---|---|
| Find Document | Finds a document by title or ID, for use in later steps. |

## Example Zap descriptions (for the Zap templates Zapier asks for)

Templates 1 and 3 need what is not built yet (the signed PDF as a file, a send action); 2, 4 and 5 work with the triggers above.

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
