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

**Assets still needed:** a 1280x800 screenshot of the popup with a result, and a 440x280 promo tile.
