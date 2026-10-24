# Orphan Page Scanner by Salsox

A free Chrome extension that finds the orphan pages on a website: pages listed in its sitemap that no other page on the site links to. Search engines find those pages only through the sitemap and tend to treat them as unimportant, so each one is worth a link from a related page.

This is a standalone extension. It does not depend on Salsox's servers or on any other extension, and it sends nothing anywhere.

## What it does

1. Reads the sitemap of the site open in the current tab (the `Sitemap:` lines in `robots.txt`, or `/sitemap.xml`), following sitemap indexes.
2. Opens each listed page, up to the limit you choose (100 to 1,000), four at a time, without cookies.
3. Collects each page's links to the same site and reports the listed pages that nothing else links to, with the pages that did not load.
4. Lets you export every page with its inbound link count as CSV, or copy the orphan list.

The scan runs in the extension's background worker, so it carries on if the popup closes; reopening the popup shows its progress or the last result for that site.

## Permissions

- `activeTab`: to read the address of the tab you clicked the extension on.
- `storage`: to keep each site's last result on your computer.
- Site access is optional and asked for one site at a time, when you press **Scan site** (Chrome shows its own prompt). The extension never has access to a site you have not scanned.

## Files

| File | What it is |
|---|---|
| `manifest.json` | Manifest V3 definition |
| `background.js` | The scan: sitemap, page fetches, results saved to storage |
| `popup.html`, `popup.css`, `popup.js` | The popup |
| `lib/scan.js` | The scanning rules as pure functions (tested in `src/lib/orphan-scanner.test.ts`) |
| `icons/` | Extension icons |
| `PRIVACY.md` | The privacy statement for the store listing |

## Try it locally

1. Open `chrome://extensions`, switch on **Developer mode**.
2. **Load unpacked**, and choose this folder.
3. Open any website, click the extension, press **Scan site**.

## Package for the Chrome Web Store

`node scripts/package-orphan-scanner.mjs` writes `dist/orphan-page-scanner-<version>.zip` (git-ignored), ready to upload in the Chrome Web Store developer dashboard. Publishing needs a Chrome Web Store developer account; the listing text is in `store-listing.md`.
