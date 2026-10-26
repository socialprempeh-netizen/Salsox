# Integrations: HubSpot, Salesforce and the OAuth server

Three pieces, each off until its environment variables are set:

| Piece | Direction | Code |
|---|---|---|
| HubSpot connection | Salsox is HubSpot's OAuth client | `src/lib/integrations/hubspot*.ts` |
| Salesforce connection and write-back | Salsox is the org's OAuth client and writes to it | `src/lib/integrations/salesforce*.ts` |
| OAuth server | Salsox is the authorization server, for the Salesforce package | `src/lib/oauth-server` |

People connect and disconnect under **Dashboard → Developers → Integrations**, which also lists the apps they allowed in through the OAuth server, with Disconnect.

## Connecting HubSpot and Salesforce

Both use the authorization code grant from `/api/integrations/{hubspot|salesforce}/connect`, which returns to `/api/integrations/{provider}/callback`. The callback is trusted only with a `state` Salsox signed (HMAC under a key derived from `AUTH_SECRET`), for the signed-in person, in the browser that started the flow (a nonce in an httpOnly cookie), within ten minutes (`oauth-state.ts`). Salesforce also uses PKCE; its verifier lives in that cookie, never in a URL. Tokens are stored sealed with AES-256-GCM (the webhook secret box), refreshed when they lapse, and revoked at the provider on Disconnect.

| Variable | Notes |
|---|---|
| `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` | From the HubSpot app's Auth settings. Redirect URL: `<site>/api/integrations/hubspot/callback`. |
| `HUBSPOT_SCOPES` | Optional. Must match the app's scope settings exactly. Default `oauth crm.objects.contacts.read crm.objects.deals.read`. |
| `SALESFORCE_CLIENT_ID`, `SALESFORCE_CLIENT_SECRET` | An External Client App (or connected app): scopes `api` and `refresh_token`, PKCE required, callback `<site>/api/integrations/salesforce/callback`. |

A Salesforce connection is to a production org (login.salesforce.com) or a sandbox (test.salesforce.com, "Connect a sandbox"). Calls go only to the instance address Salesforce returns, and only if it is a Salesforce host.

What the HubSpot connection does today is connect: the account, its scopes and live tokens. The listing's features (timeline events, the deal card, the signed PDF on the deal) build on `hubSpotAccessToken` and are not built yet; `marketing/marketplace-listings/hubspot.md` scopes them.

## Salesforce write-back

A document sent through the API with `salesforce_record_id` (15 or 18 characters) remembers the record. When it completes, the signed PDF is filed on the record (a `ContentVersion` published to it) and a completed Task is logged; when someone declines, a Task says who and why. A Task links to a Contact or Lead through `WhoId` and to anything else through `WhatId`.

Each write-back is an `IntegrationJob`, one per document and event. It runs as soon as the event happens and, if it fails, from the e-sign cron with backoff (1, 5, 30 minutes, 2 and 12 hours), up to eight attempts; the Developers page shows how many failed for good. A job records each step as it finishes, so a retry never files the PDF twice. A 401 from the org refreshes the token once.

## The OAuth server

For the Salesforce package, whose Named Credential must hold OAuth credentials rather than a pasted API key. Built in-house and deliberately small, because Better Auth's provider plugin needs a newer Better Auth than this app runs:

- authorization code grant with PKCE (S256) required, and refresh tokens; nothing else;
- one confidential client from the environment, with exact redirect addresses;
- opaque tokens stored as SHA-256 hashes: codes ten minutes and single use (a replayed code revokes what it produced), access tokens an hour, refresh tokens ninety days and rotated on every use (a rotated one used again revokes the whole connection);
- scopes that gate `/api/v1`: `documents:send`, `documents:read`, `templates:read`, `webhooks:manage`. An API key still reaches every route.

| Endpoint | |
|---|---|
| `GET /oauth/authorize` | The consent page. An unknown client or unregistered redirect address is explained there and never redirected to. Signed out, the person signs in and is brought back. |
| `POST /api/oauth/token` | `authorization_code` (with `code_verifier`) or `refresh_token`. Client authentication by HTTP Basic or in the body. |
| `POST /api/oauth/revoke` | RFC 7009: ends the token's connection. |

| Variable | Notes |
|---|---|
| `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` | What you give the package. The secret is at least 32 characters. |
| `OAUTH_REDIRECT_URIS` | The package's callback addresses, comma-separated, matched exactly. |
| `OAUTH_CLIENT_NAME` | The name on the consent page. Default "Salesforce". |

An access token is used like an API key: `Authorization: Bearer sxo_at_…`. `DELETE /api/v1/keys/current` with one ends its connection.

## Tests

Unit tests sit beside each file. Against a real database, when asked: `ESIGN_DB_TESTS=1 npx vitest run src/lib/oauth-server/store.db.test.ts src/lib/integrations/salesforce-store.db.test.ts` (codes, rotation, races and the write-back with Salesforce stubbed). Nothing here has been run against a real HubSpot account or Salesforce org yet: that needs the apps above to exist.
