# HubSpot App Marketplace: listing draft

**Status: draft, not submittable yet.** HubSpot lists public apps built on its developer platform, authorised with OAuth, and its Ecosystem Quality team reviews every listing by hand. Salsox needs, first: a HubSpot public app (OAuth only) that does what the listing below says; a public setup guide; and live, crawlable URLs for every link in the listing. Check the current minimum-install and review criteria when you start, as they change.

**Update 2026-10-25:** the events this app would show on deal timelines now exist as Salsox webhooks (sent, viewed, signed, completed, declined, expired, payment), documented at `/resources/help/webhooks-and-api`, so the app's server can receive them instead of polling. Still missing on the Salsox side: OAuth (HubSpot does not accept API keys for public apps), and an API to send a template, which "Send for signature" from a deal needs.

**Second update 2026-10-25:** the API to send a template now exists (`POST /api/v1/documents` with `template` or `saved_template_id`, `values` and the recipients), as does finding documents (`GET /api/v1/documents`) and listing templates (`GET /api/v1/templates`). What remains on the Salsox side is OAuth, scoped in the next section and not built, plus a way to fetch the signed PDF for "attached to the deal" (see the last point there).

## OAuth: what this app requires (scoped, not built)

A separate decision, so only scoped here. Check each point against HubSpot's current OAuth documentation when the build starts, since its developer platform changes.

**Direction.** HubSpot is the OAuth *provider* here: the app needs permission to read and write a customer's HubSpot data (contacts, deals, timelines, files). Salsox is the OAuth *client*. Salsox does not have to become an OAuth server for this listing.

**Flow: OAuth 2.0 authorization code grant, per HubSpot account.**

1. Register a public app in a HubSpot developer account. It gets a client id, a client secret and the redirect URL(s) it may use, for example `https://<app>/api/integrations/hubspot/callback`.
2. "Install" is a link to HubSpot's authorize page (`https://app.hubspot.com/oauth/authorize`) with `client_id`, `redirect_uri`, the `scope` list (and any `optional_scope`) and a `state` value tied to the signed-in Salsox user, so the callback cannot be forged or replayed.
3. The person chooses their HubSpot account and approves. HubSpot redirects to the callback with a `code`.
4. The callback, which needs a signed-in Salsox session (`requireUser` from `@/lib/auth`), checks `state`, exchanges the code at HubSpot's token endpoint (`POST https://api.hubapi.com/oauth/v1/token`, `grant_type=authorization_code`) for an access token and a refresh token, and stores them against the Salsox user and the HubSpot account id (`hub_id`). Linking the HubSpot account to the Salsox account is this step: the person is already signed in to Salsox, so no Salsox OAuth server is needed.
5. Access tokens are short-lived (about 30 minutes at the time of writing). Refresh with `grant_type=refresh_token` before a call when expired, and save the new token.
6. Uninstall: handle HubSpot's uninstall notification, and offer "Disconnect" in Salsox. Both delete the stored tokens.

**To build on the Salsox side:**

- A `HubSpotConnection` table: user id, `hub_id`, refresh token and access token encrypted at rest (the webhook secret box, `src/lib/webhooks/secret-box.ts`, does this already), expiry, scopes granted.
- The install link and the callback route, with `state` signed and short-lived.
- A small HubSpot client that refreshes tokens and retries once on 401.
- Delivering events to HubSpot: an internal subscriber to the same audit events webhooks use (`src/lib/webhooks/events.ts`) that writes timeline events, rather than a webhook to a URL, since the app's server is Salsox itself.
- The deal-record card (a HubSpot UI extension) calls Salsox to send a template. Requests from HubSpot carry HubSpot's request signature, which Salsox must verify and map to the `hub_id`, and from it the Salsox user. The send then goes through the same engine function the API uses (`sendFromApi` in `src/lib/esign/api-send.ts`).
- **Scopes**, least needed, names to confirm in HubSpot's current list: read contacts, companies and deals; timeline events; files (only if the signed PDF is attached). Optional scopes for anything a customer may refuse.
- **Signed PDF.** "Signed PDF attached to the deal" needs a way to fetch the sealed PDF, which the public API does not offer yet. Inside Salsox the integration can read it from storage directly; if it ever runs outside Salsox, add `GET /api/v1/documents/{id}/pdf`.

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
