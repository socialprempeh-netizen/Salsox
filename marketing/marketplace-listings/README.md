# Marketplace listing drafts

Draft copy and assets for listing Salsox in three integration marketplaces, to review and submit by hand. Nothing here has been submitted.

| Marketplace | File | Can it be submitted today? |
|---|---|---|
| Zapier App Directory | [zapier.md](zapier.md) | No: needs a Zapier integration built on a public Salsox API |
| HubSpot App Marketplace | [hubspot.md](hubspot.md) | No: needs a HubSpot public app (OAuth) and a public setup guide |
| Salesforce AppExchange | [salesforce-appexchange.md](salesforce-appexchange.md) | No: needs a Salesforce connected app or package and a passed security review |

## The blocker they share

All three marketplaces list *working integrations*, reviewed before they go live. Salsox has no public API, webhooks or native integration today (the site says so on `/esignature-api` and `/integrations/zapier`). Each draft therefore describes the integration as it is planned, and says at the top what must be built before it can be submitted. Do not submit any of them, or publish the copy anywhere, before that work ships: a listing that promises features that do not exist will be rejected, and is false advertising if it is not.

Recommended order: build the public API and webhooks first, then the Zapier integration (smallest build, widest reach: it also covers Make-style users who search Zapier), then HubSpot, then AppExchange (largest effort, security review).

## Assets

`assets/` holds the Salsox mark as square transparent PNGs, exported from `public/brand/logo-mark.png`:

- `logo-512.png`: Zapier (square, transparent, at least 512 px, no text in the mark).
- `logo-800.png`: HubSpot app icon and AppExchange listing logo (both accept a large square; check the current size in each form when submitting).
- `logo-256.png`: smaller fallback.

Screenshots must be of the real integration, so they cannot be made yet. Each draft lists the screenshots to capture once it exists.

## Requirements checked

Checked on 2026-10-24 against each marketplace's own documentation, linked in each file. Requirements change; re-read them when you submit.
