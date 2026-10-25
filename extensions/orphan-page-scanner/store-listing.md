# Chrome Web Store listing: Orphan Page Scanner by Salsox

Draft text for the store listing, to paste in the developer dashboard.

**Name:** Orphan Page Scanner by Salsox

**Summary (132 characters max):**
Find the pages in your sitemap that no other page links to. Free, private, runs in your browser. Export results as CSV.

**Category:** Developer Tools

**Language:** English

**Description:**

Orphan pages are pages listed in your sitemap that no other page on your site links to. Search engines can still find them through the sitemap, but with no internal links pointing at them they look unimportant, and they rarely rank.

Orphan Page Scanner finds them in one click:

- Reads your sitemap from robots.txt or /sitemap.xml, including sitemap indexes
- Opens every listed page (up to 1,000) and counts the links between them
- Lists the orphan pages, and the pages that did not load
- Exports every page with its inbound link count as CSV, or copies the orphan list

Private by design: the scan runs in your browser and contacts only the site you scan, without your cookies. Nothing is sent to us or anyone else. Access to a site is asked for only when you scan it.

Built by Salsox, e-signatures built for phones.

**Single purpose (for review):** Scan the sitemap of the site in the current tab and report which listed pages receive no internal links from the site's other pages.

**Permission justifications:**
- activeTab: read the address of the current tab, to know which site to scan.
- storage: keep each site's last scan result locally.
- Optional host access (requested per site at scan time): fetch that site's robots.txt, sitemap and pages to count their links.

**Data usage disclosures:** Does not collect or transmit user data.

**Privacy policy URL:** https://salsox.com/resources/help/orphan-page-scanner-privacy (the same statement as `PRIVACY.md`). Live once the commit that adds `content/help/articles/orphan-page-scanner-privacy.md` is deployed.

**Homepage URL:** https://salsox.com (also in the manifest's `homepage_url`).

**Support:** https://salsox.com/contact

## Assets (ready)

In `store-assets/`, made by `node scripts/orphan-scanner-store-check.mjs` from the packaged zip loaded in Chromium and a real scan of a demo site:

| File | Store field |
|---|---|
| `screenshot-1-result.jpg` (1280x800) | Screenshot 1: the result, with orphans listed |
| `screenshot-2-start.jpg` (1280x800) | Screenshot 2: the start screen |
| `promo-tile-440x280.jpg` (440x280) | Small promo tile |
| `icons/icon-128.png` (in the extension) | Store icon (128x128) |

## Submitting (by hand)

1. `node scripts/package-orphan-scanner.mjs`, then `node scripts/orphan-scanner-store-check.mjs`; upload `dist/orphan-page-scanner-<version>.zip` only if every check passed.
2. In the Chrome Web Store developer dashboard (a one-time registration fee applies to the developer account), **New item**, upload the zip.
3. **Store listing:** paste the name, summary, description and category above; upload the images.
4. **Privacy practices:** paste the single purpose and the permission justifications; for data usage, tick none, and certify the three statements (no selling, no unrelated use, no creditworthiness use). Remote code: **No**.
5. Submit for review. A new version later: bump `version` in `manifest.json`, repackage, re-run the check, upload.
