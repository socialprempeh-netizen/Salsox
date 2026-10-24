# Marketplace listing: Orphan Page Scanner (Claude skill)

Draft text for submitting the skill, to review before submission.

**Name:** Orphan Page Scanner

**One-line description:** Find the pages in your sitemap that no other page links to, with specific internal-linking fixes.

**Category:** SEO / Marketing

**Price:** Free

**Long description:**

Orphan pages are listed in your sitemap but get no links from the rest of your site, so search engines treat them as unimportant and visitors never find them. Ask Claude to check a site for orphan pages and this skill scans it: it reads the sitemap, opens every listed page and counts the links between them. Claude then lists each orphan with one or two related pages that should link to it and the anchor text to use, flags sitemap entries that no longer load, and points to the weakest-linked pages to strengthen next.

- No API key or account: a small Node script does the scan.
- Private: only the site being scanned is contacted, without cookies.
- Honest about limits: a partial scan is reported as candidates, not as orphans.

**Example prompts:**
- "Check example.com for orphan pages."
- "Which pages on my site have no internal links?"
- "Do an internal-linking audit of example.com and tell me what to fix."

**Requirements:** Node.js 18 or later where Claude runs the script (Claude Code, or a code-execution environment with network access).

**Publisher:** Salsox (https://salsox.com)

**Support:** hello@salsox.com

**Licence:** MIT
