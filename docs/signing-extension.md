# The signing Chrome extension

`extensions/salsox-signing` is a Manifest V3 Chrome extension that sends a PDF for signature from the browser: connect an existing account, choose a PDF, place signature, date and text fields, add the signers, send. It has no backend of its own; it calls the public API (`docs/webhooks.md`) with an API key it receives when the person connects. The extension's own README covers its files, permissions and packaging; this guide is the server side.

## Where things are

| Piece | File |
|---|---|
| The connect rules (which extension may receive a key) | `src/lib/extension-connect.ts` |
| The connect page | `src/app/(auth)/extension/connect/page.tsx`, `src/components/auth/extension-consent.tsx` |
| Making the key | `src/app/actions/extension-connect.ts` (calls `createApiKey`) |
| The sign-in policy check outside the dashboard | `src/lib/security-enrollment.ts` |
| Plan and allowance for the popup | `GET /api/v1/me` (`plan`) |
| Revoking on disconnect | `DELETE /api/v1/keys/current` |
| Sending | `POST /api/v1/documents`, unchanged |
| The extension's rules, tested | `extensions/salsox-signing/lib/fields.js`, `src/lib/signing-extension.test.ts` |
| End to end, unpacked in Chromium | `e2e/signing-extension.spec.ts` |

## Connecting

The extension calls `chrome.identity.launchWebAuthFlow` with `/extension/connect?redirect_uri=https://<extension id>.chromiumapp.org/connected`. The window shares the browser's session, so a signed-in person only confirms. On **Connect** the server makes an API key named "Salsox Signing (Chrome extension)" and sends the window to the redirect address with the key in the fragment. Chrome intercepts every navigation to `<id>.chromiumapp.org` and hands it to that extension alone; the key never crosses the network.

Other outcomes come back the same way as `#error=`: `signed_out` (the extension opens `/login` in a tab; the sign-in page is untouched, so every method and 2FA work, and the person presses Connect again), `setup_required` (the admin's policy requires 2FA and none is set up; the extension opens the dashboard, which shows the setup), `cancelled`, `limit` (the account has the most API keys it can have).

**The allowlist is the security boundary.** Any extension can open the page with its own redirect address, so only ids in `SIGNING_EXTENSION_IDS` (comma-separated) receive a key. In development any id is accepted, so an unpacked copy can be tried. Unset in production, no extension can connect.

## Configuration

- `SIGNING_EXTENSION_IDS`: the extension's id. The Chrome Web Store assigns it at the first upload (it is on the item's dashboard page); add it on the server before the listing goes live, or Connect shows "This link is not from the extension".
- `/extension/` is in the proxy's unlocalized paths (`src/proxy.ts`), so the page is served at that exact address.

## What it does not do

No Sign & Pay (a Business account is pointed to the dashboard for it), no approvers or copies, no templates. Each of those is in the API or the dashboard already and can be added to the popup later without server changes, except Sign & Pay, which `POST /api/v1/documents` does not take yet.
