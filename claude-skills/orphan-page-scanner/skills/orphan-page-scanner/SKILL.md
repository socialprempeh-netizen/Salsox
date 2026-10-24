---
name: orphan-page-scanner
description: Finds orphan pages on a website, the pages its sitemap lists that no other page of the site links to, and explains how to fix them. Use when someone asks for an internal-linking or SEO audit, wants to know why pages are not indexed or ranking, mentions orphan pages, or asks which pages of their site have no internal links.
license: MIT
---

# Orphan Page Scanner

An orphan page is listed in a site's sitemap but receives no link from any other page of the site. Search engines can find it through the sitemap, but with no internal links pointing at it, it looks unimportant: it is crawled less, passes on no authority and rarely ranks. Visitors cannot reach it by browsing.

This skill scans a site and reports its orphans, then turns the result into fixes.

## How to scan

Run the bundled script with Node 18 or later. It needs no install and no API key:

```bash
node scripts/find-orphans.mjs https://example.com --max 1000 --json
```

- `--max` is how many sitemap pages to check (default 250, up to 5000). Use a limit at least as large as the sitemap: only a complete scan proves a page is an orphan.
- `--json` prints the full result for you to analyse; without it the output is a short human summary.
- `--csv path.csv` also writes every page with its inbound link count, for a spreadsheet.

The script reads `robots.txt` for `Sitemap:` lines (falling back to `/sitemap.xml`), follows sitemap indexes, fetches each listed page four at a time without cookies, and counts the links between them. It contacts only the site being scanned.

## Reading the result

The JSON has:

- `listed`: pages found in the sitemap; `crawled`: pages that loaded as HTML.
- `capped`: true when the sitemap had more pages than `--max`. Then `orphans` are only *candidates*: the page that links to one may not have been read. Re-run with a higher `--max` before reporting any of them as orphans.
- `orphans`: listed pages no other checked page links to.
- `failed`: listed pages that did not load (status or `error`). They are themselves problems: a sitemap should list only live pages.
- `weakest`: the linked pages with the fewest inbound links, often the next pages to strengthen.

## What to tell the person

1. Say how complete the scan was (`listed`, whether `capped`), and the counts.
2. List each orphan with a concrete fix. For each, suggest one or two existing pages that are topically related and could naturally link to it, with the anchor text to use (describe the destination, never "click here"). Pages in the same section or hub are the usual candidates.
3. Where an orphan should not exist (an old campaign page, a duplicate, a test page), recommend removing it from the sitemap, or redirecting it, instead of linking it.
4. Mention any `failed` pages and that they should be fixed or dropped from the sitemap.
5. If there are no orphans, say so plainly, and point to `weakest` as the next improvement.

Keep the advice specific to the pages found; do not pad it with generic SEO tips.

## Limits

- Pages are read as served, without running JavaScript. Links that only appear after scripts run are not seen, which can make a page built entirely in the browser look orphaned. Mention this if the site is a single-page app.
- Links from other websites do not count: this is about the site's own internal links.
- Only pages on the same host as the address given are considered (`https://example.com` and `https://www.example.com` are different hosts).

Built by Salsox (https://salsox.com), e-signatures built for phones. The same scanner is available as a free Chrome extension.
