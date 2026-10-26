# Marketplace listing drafts

Draft copy and assets for listing Salsox in three integration marketplaces, to review and submit by hand. Nothing here has been submitted.

| Marketplace | File | Can it be submitted today? |
|---|---|---|
| Zapier App Directory | [zapier.md](zapier.md) | Closer, not yet: everything it needs on the Salsox side exists, triggers, actions and search (2026-10-25); the Zapier integration itself must still be built on Zapier's platform and tested privately |
| HubSpot App Marketplace | [hubspot.md](hubspot.md) | No: needs a HubSpot public app with OAuth (HubSpot does not accept API keys; flow scoped in the draft) and a public setup guide; webhooks and the send API now supply the rest |
| Salesforce AppExchange | [salesforce-appexchange.md](salesforce-appexchange.md) | No: needs partner enrolment, Salsox as an OAuth server for the package's Named Credential (scoped in the draft), the package, and a passed security review |

## What exists now (2026-10-25)

The shared blocker was "no public API, no webhooks". Salsox now has the foundation all three build on:

- **Webhooks** for `document.sent`, `document.viewed`, `document.signed`, `document.completed`, `payment.sent`, `document.declined` and `document.expired`: signed JSON (HMAC-SHA256 in a Stripe-style timestamped header), retried for about 40 hours, with a delivery log, test sends and manual resend on Dashboard → Developers.
- **API keys** (per account, stored hashed, revocable, last use shown) and a **REST API** at `/api/v1`: `GET /me` (key test), `GET` and `POST /webhooks` (subscribe, REST-hook style), `DELETE /webhooks/{id}` (unsubscribe), `GET /webhooks/sample?event=` (sample data), and since the second update `POST /documents` (create and send, from a PDF or a template, through the dashboard's own send path), `GET /documents` and `GET /documents/{id}` (find), and `GET /templates`.
- **Public documentation**: `/resources/help/webhooks-and-api` (events, payload, headers, signature check, retries, API) and `/resources/help/connect-zapier-or-make`.
- The public pages `/esignature-api`, `/integrations/zapier` and `/integrations/make` now say this, and still say plainly what is missing.

## What is still missing

- ~~An API to create and send documents.~~ Exists since the second update on 2026-10-25 (`POST /api/v1/documents`).
- **OAuth.** HubSpot and AppExchange require it; Zapier accepts API keys, which is why it is first. The two need different things. HubSpot: Salsox as an OAuth *client* of HubSpot. AppExchange: Salsox as an OAuth *server* for the package. Each draft scopes its flow; neither is built.
- ~~**The signed PDF through the API** (`GET /api/v1/documents/{id}/pdf`).~~ Exists since 2026-10-26: the signed PDF once completed, the original until then, `?version=` to choose. The HubSpot and AppExchange features "attach the signed PDF" and Zapier's "save to Google Drive" template can use it.
- **The integrations themselves**, built on each platform, tested with real accounts, with screenshots taken from them.

Recommended order is unchanged: Zapier first (a full first version, triggers, actions and search, is possible now), then HubSpot (after OAuth), then AppExchange. Do not submit or publish any draft before its integration exists.

## Assets

`assets/` holds the Salsox mark as square transparent PNGs, exported from `public/brand/logo-mark.png`:

- `logo-512.png`: Zapier (square, transparent, at least 512 px, no text in the mark).
- `logo-800.png`: HubSpot app icon and AppExchange listing logo (both accept a large square; check the current size in each form when submitting).
- `logo-256.png`: smaller fallback.

Screenshots must be of the real integration, so they cannot be made yet. Each draft lists the screenshots to capture once it exists.

## Requirements checked

Requirements were checked on 2026-10-24 against each marketplace's own documentation, linked in each file; the status above was updated on 2026-10-25. Requirements change; re-read them when you submit.
