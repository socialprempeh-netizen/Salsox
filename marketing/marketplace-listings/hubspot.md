# HubSpot App Marketplace: listing draft

**Status: draft, not submittable yet.** HubSpot lists public apps built on its developer platform, authorised with OAuth, and its Ecosystem Quality team reviews every listing by hand. Salsox needs, first: a HubSpot public app (OAuth only) that does what the listing below says; a public setup guide; and live, crawlable URLs for every link in the listing. Check the current minimum-install and review criteria when you start, as they change.

Requirements source: [HubSpot App Marketplace listing requirements](https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/app-marketplace-listing-requirements).

Rules to respect in everything below: the listing describes this integration's value, not Salsox in general; never put "Hub" or "HubSpot" in the app's name or logo.

## Listing fields

**App name:** Salsox

**Icon:** `assets/logo-800.png`

**Tagline** (short, one line):

> Send contracts for e-signature from HubSpot deals and see every signature on the record.

**Overview / description:**

> Salsox connects e-signatures to your HubSpot deals and contacts. Send a contract, quote or agreement for signature from the deal record, using your saved Salsox templates with the contact's details filled in. Recipients sign on any phone, by email, WhatsApp or SMS link, with no account.
>
> Every step comes back to HubSpot: the deal timeline shows when the document was sent, opened, signed or declined, and the signed PDF is attached to the record. Use a completed signature to move a deal stage or start a workflow, and collect the first payment as the customer signs with Sign & Pay.

**Key features (up to five):**

1. Send Salsox templates for signature from a deal or contact, with details filled in.
2. Signature events on the HubSpot timeline: sent, viewed, signed, declined.
3. Signed PDFs attached to the deal automatically.
4. Workflow triggers when a document is completed or declined.
5. Collect payment at signing (Sign & Pay) and see it on the deal.

**Category:** Sales enablement / Contracts and e-signature

**Works with:** Sales Hub, Service Hub (contacts, companies, deals, tickets)

**Pricing shown on the listing:** Free to install; uses the customer's existing Salsox plan (Free, Personal, Business).

## Data the app will need (to declare in the listing's scopes section)

- Read contacts, companies and deals: to fill templates and attach documents.
- Write timeline events and engagements: to show signature progress.
- Files: to attach signed PDFs.

Request no scope the features above do not use; reviewers check.

## Required URLs (must be live before submission)

- Setup guide: a new `/integrations/hubspot` page (create it with the integration, in `content/pages/integrations/`).
- Privacy policy: `/privacy`. Terms: `/terms`. Support: `/contact`.

## Screenshots to capture once built

1. The Salsox card on a HubSpot deal record, with "Send for signature".
2. Choosing a template, with the contact's fields filled in.
3. A deal timeline showing sent, viewed and signed events.
4. The signed PDF attached to the deal.
5. A HubSpot workflow using the "Document completed" trigger.
