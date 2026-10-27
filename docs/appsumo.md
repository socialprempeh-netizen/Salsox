# AppSumo lifetime deals

Selling a lifetime plan on AppSumo, through AppSumo's Licensing API (v2). Off until `APPSUMO_API_KEY` is set.

| Piece | Where |
|---|---|
| Rules: signature, events, tiers, who may redeem | `src/lib/appsumo.ts` (tested in `appsumo.test.ts`) |
| Database, AppSumo and Stripe calls | `src/lib/appsumo-store.ts` |
| Webhook | `POST /api/webhooks/appsumo` |
| Where AppSumo sends a buyer after activation (OAuth redirect URL) | `/redeem` |
| The account's license and the redeem form | `/dashboard/redeem` |
| A key entered before signing in, redeemed after | `components/appsumo/resume-pending.tsx`, mounted by the dashboard layout |

## Why licensing, not codes

AppSumo offers two ways to fulfil a deal. A codes deal is a CSV of strings AppSumo sells and never mentions again, so nothing tells the app when a buyer is refunded. A licensing deal sends a signed webhook for every change to a license, and a refund arrives as `deactivate`. That is what lets a refunded buyer lose the plan instead of keeping it forever.

## Tiers

| AppSumo tier | Plan | |
|---|---|---|
| 1 | Personal | unlimited documents, Quick Send, saved templates, WhatsApp/SMS links |
| 2 | Business | everything in Personal, plus Sign & Pay, signing order and approvers, sealed PDFs |

An account is one user, so a higher tier unlocks features, never seats, and an account holds one active license. A buyer moves between tiers on AppSumo: an upgrade or downgrade issues a new key and deactivates the old one, and the new key inherits the account automatically.

The license tier joins the plan rules in one place, `accountTier` in `src/lib/esign/sender.ts`, next to billing and referral months. Every plan gate reads it there, so a deactivation takes effect on the next request, with no job to run.

## No recurring billing

A license is a lifetime plan, so redeeming one stops any Stripe subscription it covers: the subscription is set to end with the period already paid for, the same way the billing page's Cancel button does it. A subscription to a higher plan than the license is left alone. While a license is active, the billing page says so and does not offer the subscription plans.

## Setup

1. In the AppSumo Partner Portal, set the deal's fulfilment to licensing, the webhook URL to `<site>/api/webhooks/appsumo` and the OAuth redirect URL to `<site>/redeem`.
2. Set `APPSUMO_API_KEY` to the licensing API key. It signs the webhooks and authorises lookups.
3. Optionally set `APPSUMO_CLIENT_ID` and `APPSUMO_CLIENT_SECRET`, the OAuth client. With them a buyer arriving from AppSumo has their key read for them; without them they paste it.
4. Apply the migration (`20261027090000_appsumo_licenses`) and deploy.
5. Run AppSumo's licensing test. It requests `/redeem` (must answer 200 without redirecting) and sends a test event to the webhook (answered `{ event, success: true }`, not applied).

## The webhook

- **Signature**: `X-Appsumo-Signature` is the hex HMAC-SHA256 of `X-Appsumo-Timestamp` followed by the raw body, keyed with the API key. A request outside 15 minutes of the server's clock is refused, so a captured request cannot be replayed.
- **Answer**: `200 { event, success: true }` for every signed event, including ones that change nothing. AppSumo keeps a license inactive until its activation is acknowledged. A failure to record answers 500, and AppSumo retries.
- **Order**: each row keeps the timestamp of the last event applied, and an older event delivered late is ignored. A late `purchase` never undoes an activation.
- **Add-ons** (`parent_license_key`) and `migrate` are acknowledged and ignored: this deal has no add-ons.

## Redeeming

A key is checked against the webhook record first. When that record does not say active (the activation webhook has not landed yet, or failed), AppSumo's API is asked (`GET /v2/licenses/:key`). Refused, with a message for each: not a key, unknown to AppSumo, deactivated, not activated yet, redeemed by another account, or the account already holds a license. The claim is a conditional update, so two accounts racing for one key cannot both win.

Signed out, a key waits in an httpOnly cookie for an hour. The first dashboard visit after sign-up or log-in redeems it and shows the result on `/dashboard/redeem`.
