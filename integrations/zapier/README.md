# Salsox app for Zapier (Zapier Platform CLI)

The Salsox app on Zapier's Developer Platform. It exists so that people can
use Salsox in a Zap by picking it from Zapier's app list, instead of
hand-building "Webhooks by Zapier" requests (the setup
`content/help/articles/connect-zapier-or-make.md` describes today). It is a
client of Salsox's public API (`/api/v1`, described in `docs/webhooks.md`)
and does nothing the API does not already do.

## What it offers

| Step | Kind | Key | API |
| --- | --- | --- | --- |
| New Signature | Instant trigger | `document_signed` | REST hook on `document.signed` |
| New Completed Document (with the signed PDF as a file) | Instant trigger | `document_completed` | `document.completed`, file from `GET /documents/{id}/pdf?version=signed` |
| New Declined Document | Instant trigger | `document_declined` | `document.declined` |
| New Document View | Instant trigger | `document_viewed` | `document.viewed` |
| New Sent Document | Instant trigger | `document_sent` | `document.sent` |
| New Expired Document | Instant trigger | `document_expired` | `document.expired` |
| Send Document From Template | Action | `send_template` | `POST /documents` with `template` or `saved_template_id` |
| Send Document From PDF | Action | `send_pdf` | `POST /documents` with `file_url` (Quick Send) |
| Find Document | Search | `find_document` | `GET /documents?title=&recipient=&status=` |
| Find or Send Document | Search-or-create | `find_document` | the two above |

Every trigger subscribes with `POST /webhooks` and unsubscribes with
`DELETE /webhooks/{id}`. The test step shows the account's own recent events
(`GET /events`, up to 100, newest first), and falls back to Salsox's sample
(`GET /webhooks/sample`) for an account with none yet. No step takes
payments: Zapier does not publish integrations that move money (its
publishing requirement 1.4).

## Files

- `index.js`: the app definition (`version` and `platformVersion` come from
  `package.json`).
- `authentication.js`: API key auth, tested with `GET /me`, labelled with the
  account's email.
- `triggers/`, `creates/`, `searches/`: one file per step.
- `lib/`: the shared parts. `api.js` (the key, and every API refusal turned
  into a plain sentence and the right Zapier error), `hook-trigger.js`,
  `samples.js`, `document.js`, `templates.js`, `pdf.js`, `search.js` and
  `files.js` (the signed PDF hydrator).
- `test/`: run by the repository's own `npm test` (Vitest), without this
  folder's dependencies installed.
- `assets/logo-256.png`: the 256×256 logo for the Zapier listing.
- `LISTING.md`: the listing copy and the answers for Zapier's publishing
  form. `ZAP-TEMPLATES.md`: three Zap templates to create once the app is
  public.

## Working on it

```sh
cd integrations/zapier
npm install                      # zapier-platform-core and the CLI, into this folder only
npx zapier-platform validate     # Zapier's schema and publishing checks: all must pass
cd ../.. && npm test             # the app's tests, with the rest of the repository's
```

The API's base URL is fixed to production (`lib/api.js`): Zapier publishes
only integrations that call production endpoints (requirement 5.4), and it
allows environment variables only for authentication credentials.

## Uploading it

Once per machine: `npx zapier-platform login` (Zapier keeps the deploy key in
`~/.zapierrc`, in the home folder, never here). Once per app:
`npx zapier-platform register "Salsox"` in this folder, which writes
`.zapierapprc` (the app's id, not a secret; commit it). Then for each
version: raise `version` in `package.json`, run `npx zapier-platform validate`,
then `npx zapier-platform push`.

Changing a step's `key`, or the key of any of its fields, breaks the Zaps and
Zap templates built on it. Add new keys instead of renaming old ones.
