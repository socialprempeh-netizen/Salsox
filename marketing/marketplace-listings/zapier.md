# Zapier App Directory: listing draft

**Status: draft, not submittable yet.** Zapier publishes only integrations built on its Developer Platform that pass review. Salsox needs, first: a public API with API-key or OAuth authentication, webhooks (REST hooks) for instant triggers, and the Zapier integration itself with the triggers and actions below, tested by real users while private.

Requirements source: [Zapier integration publishing requirements](https://docs.zapier.com/platform/publish/integration-publishing-requirements), [branding guidelines](https://docs.zapier.com/platform/publish/branding-guidelines), [build guidelines](https://docs.zapier.com/platform/publish/integration-build-guidelines).

## Branding fields

**Name:** Salsox

**Logo:** `assets/logo-512.png` (square, transparent PNG, 512 x 512, mark only, no text).

**Description** (160 characters at most; Zapier asks for the form "Name is a..."):

> Salsox is an e-signature app built for phones: send PDFs to sign by email, WhatsApp or SMS, track every signature, and collect payment as people sign.

(154 characters.)

**Category:** Signatures (fallback: Documents)

**Audience:** Small businesses, freelancers and sales teams.

**Role:** Employee of the company that owns the app.

## Planned triggers

| Trigger | Description shown in Zapier | Type |
|---|---|---|
| Document Completed | Triggers when everyone has signed a document. Includes the title, signers and a link to the signed PDF. | Instant (webhook) |
| Document Signed by Recipient | Triggers each time one recipient signs a document. | Instant |
| Document Declined | Triggers when a recipient declines to sign. | Instant |
| Document Expired | Triggers when a document's signing links expire before everyone has signed. | Instant |
| Payment Received | Triggers when a signer pays through Sign & Pay. | Instant |

## Planned actions

| Action | Description |
|---|---|
| Send Template for Signature | Sends one of your saved templates to a new recipient, with their name and email filled in. |
| Send PDF for Signature | Sends a PDF from a previous step, such as Google Drive or Gmail, for signature with fields placed automatically. |

## Planned searches

| Search | Description |
|---|---|
| Find Document | Finds a document by title or ID, for use in later steps. |

## Example Zap descriptions (for the Zap templates Zapier asks for)

1. **Save signed Salsox documents to Google Drive.** When a document is completed in Salsox, upload the signed PDF to a Google Drive folder.
2. **Post to Slack when a contract is signed.** When a document is completed in Salsox, send a message to a Slack channel with its title and signers.
3. **Send a Salsox agreement for every new HubSpot deal.** When a deal reaches a chosen stage in HubSpot, send a Salsox template to the contact.
4. **Log Salsox payments in Google Sheets.** When a payment is received in Salsox, add a row with the amount, payer and document.
5. **Chase declined documents.** When a recipient declines in Salsox, create a task in Asana for the document's owner.

## Screenshots and testing to prepare

- The connection screen in Zapier (authentication) and one Zap built from each trigger above, for review.
- Test accounts for Zapier's reviewers, with sample documents and a template.

## Help article (needed before submission)

A public page at `/integrations/zapier` already exists. When the integration ships, rewrite it from "in development" to the real setup: connect your account, pick a trigger, and the example Zaps above. Update `integration.status` in `content/pages/integrations/zapier.md` to `works-today` in the same change.
