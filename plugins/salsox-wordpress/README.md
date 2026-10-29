# Salsox for WordPress (developer notes)

The WordPress plugin that adds a "Request a signature" form to a site. The
user-facing description, FAQ and the disclosure of the external service are
in `readme.txt` (WordPress.org's format). This file is for whoever works on
the plugin, and is left out of the zip.

## What it calls

Only the documented public API, `https://salsox.com/api/v1`, with the site
owner's API key, from the server (`includes/class-salsox-api.php`):

| Call | Used for |
|---|---|
| `GET /me` | The connection test, and the account and plan shown on Settings > Salsox |
| `GET /templates` | The template choices in the settings and the block (one-signer templates only) |
| `POST /documents` | Sending the document to a visitor (`template`, `saved_template_id` or `file_url`) |
| `GET /documents?limit=100` | The status column of the request log |
| `DELETE /keys/current` | Disconnect revokes the key |

What the API cannot do today, so the plugin does not either: signing inside
the page (the API never returns signing links; Salsox emails the visitor),
connecting with OAuth instead of a pasted key, scoped keys (a key can do
everything its account can, which is why it never leaves the server), PDFs
over 4 MB, and PDFs from a site Salsox cannot reach over public HTTPS.

## Layout

| File | Does |
|---|---|
| `salsox.php` | Plugin header, constants, loads the rest |
| `includes/class-salsox-api.php` | The only outgoing requests |
| `includes/class-salsox-settings.php` | Settings > Salsox, connection test, disconnect, privacy policy text |
| `includes/class-salsox-form.php` | The form (shortcode and block), signed form settings, limits, the request log |
| `includes/class-salsox-rest.php` | `/wp-json/salsox/v1/request` (public) and `/templates` (editors) |
| `blocks/request-signature/` | The block: `block.json` and the editor script (plain JS, no build) |
| `assets/` | Front-end and admin CSS and JS, the teal "S" icon |
| `uninstall.php` | Deletes every option and transient the plugin made |
| `.wordpress-org/` | Listing icons for the WordPress.org SVN `assets/` folder, not the zip |
| `bin/` | Zip builder and the local WordPress for checks, not the zip |

The slug and text domain are `salsox`; the repository folder name is not the
slug (WordPress.org refuses "wordpress" in a slug). The zip puts everything
under `salsox/`.

## Checking and building

```sh
docker compose -f plugins/salsox-wordpress/bin/docker-compose.yml up -d
W="docker compose -f plugins/salsox-wordpress/bin/docker-compose.yml exec -T cli wp"
$W core install --url=http://localhost:8089 --title=Test --admin_user=admin --admin_password=local-only --admin_email=admin@example.com --skip-email
$W plugin install plugin-check --activate
$W plugin activate salsox
$W plugin check salsox --include-experimental --include-low-severity-errors --include-low-severity-warnings

# Pages the Playwright checks use (IDs 4 and 5 on a fresh install)
$W post create --post_type=page --post_status=publish --post_title=Sign --post_content='[salsox_sign template="liability-waiver" values="Activity=Guided kayak tour|Participant name={name}"]'
$W post create --post_type=page --post_status=publish --post_title=Block --post_content='<!-- wp:salsox/request-signature {"source":"template","template":"photo-release-form"} /-->'
WP_PLUGIN_URL=http://localhost:8089 E2E_BASE_URL=http://localhost:8089 npx playwright test e2e/wordpress-plugin.spec.ts

python plugins/salsox-wordpress/bin/build-zip.py   # writes dist/salsox.zip
```

The database password in the compose file only guards a throwaway local
container.
