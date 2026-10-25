# Salsox Signing (Chrome extension)

Send a PDF for e-signature without leaving the browser: sign in with an existing Salsox account, choose a PDF, place signature, date and text fields, add each signer's email, send. A simplified version of the field placement on salsox.com, on the same signing engine.

It talks only to Salsox (`SERVER` in `config.js`, `https://salsox.com`). There is no backend of its own: it calls the public API (`/api/v1`) with an API key it is given when the person connects.

## How it works

| Step | What happens |
|---|---|
| Connect | `chrome.identity.launchWebAuthFlow` opens `/extension/connect` in a window that shares the browser's Salsox session. The person confirms; the page creates an API key ("Salsox Signing (Chrome extension)", listed under Developers) and hands it back through Chrome's private `https://<extension id>.chromiumapp.org/` redirect, so it never crosses the network. Not signed in: the extension opens the ordinary sign-in page in a tab, where passwords, Google, passkeys and 2FA all work, and the person presses Connect again. |
| Plan | `GET /api/v1/me` gives the plan, the free documents left this month and the plan's features. |
| Upload | A PDF up to 4 MB, read in the popup, rendered with pdf.js (bundled in `vendor/pdfjs`, no remote code). |
| Place | Signature, date and text fields, clicked onto the page and dragged into place, for up to five signers, each in their own colour. Text fields can carry a label. |
| Send | One multipart `POST /api/v1/documents` from the background worker: the PDF, the signers, the fields. The server sends it through the same path as the dashboard: plan rules, emails, audit trail, webhooks. |
| Upgrade | The Free plan's 3 documents a month, signing in order and Sign & Pay offer an upgrade (a link to `/pricing`) instead of a send the server would refuse; a refusal that still comes back (402) shows the same prompt. Sign & Pay is not set up from the extension on any plan yet; Business accounts are pointed to salsox.com for it. |
| Disconnect | `DELETE /api/v1/keys/current` revokes the key on the server, then everything stored is forgotten. |

The server is the authority on every rule; the popup only tells the person first.

## Server requirements

- `SIGNING_EXTENSION_IDS` on the server must list this extension's id (from the Chrome Web Store dashboard once uploaded, or `chrome://extensions` for an unpacked copy). Without it, `/extension/connect` refuses to hand out a key, except in development. See `docs/signing-extension.md`.

## Permissions

- `storage`: the API key, the account and plan, and the document being prepared, in `chrome.storage.local` on this computer.
- `identity`: `launchWebAuthFlow`, for the Connect window.
- Host access to `https://salsox.com/*` only: the API calls.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Manifest V3 definition |
| `config.js` | The server address |
| `background.js` | Connect, send, refresh, disconnect (survives the popup closing) |
| `popup.html`, `popup.css`, `popup.js` | The popup: connect, upload, place, recipients, result |
| `lib/fields.js` | The rules as pure functions (tested in `src/lib/signing-extension.test.ts`) |
| `vendor/pdfjs/` | pdf.js 6.3.289 (`pdfjs-dist`), Apache-2.0, unmodified |
| `icons/` | The brand icon, the plain teal S: the same files as the Orphan Page Scanner's `icons/` |
| `PRIVACY.md`, `store-listing.md` | For the Chrome Web Store |

## Try it locally

1. Run the app (`npm run dev`); in development any extension id may connect.
2. Copy this folder, and in the copy set `SERVER` in `config.js` to your local address and `host_permissions` in `manifest.json` to match (for example `http://localhost:3000/*`).
3. `chrome://extensions`, **Developer mode**, **Load unpacked**, choose the copy.

`e2e/signing-extension.spec.ts` does exactly this and runs the whole flow.

## Package for the Chrome Web Store

`node scripts/package-salsox-signing.mjs` writes `dist/salsox-signing-<version>.zip` (git-ignored). It refuses a copy whose `config.js` or `host_permissions` do not point at `https://salsox.com`.
