---
title: SEO
description: How the public site is built to be found, how to add pages without creating duplicates, and how to connect Search Console, Bing and analytics.
---

# SEO

How the public site is built to be found: the pages, the rules that keep them worth indexing, the technical plumbing, and the services to connect after you deploy.

## What is built in

| Area | Where |
|---|---|
| Unique title, description, canonical, Open Graph and Twitter card per page | `src/lib/metadata.ts`, `src/lib/seo/page-metadata.ts` |
| Social image per landing, tool and comparison page | `opengraph-image.tsx` beside each route, `src/components/seo/og-card.tsx` |
| Sitemap with real last-modified dates | `src/app/sitemap.ts` |
| robots.txt | `src/app/robots.ts` |
| `noindex` on dashboard, admin, sign-in pages, API and signing links | `next.config.ts` (`X-Robots-Tag`), the `(auth)` layout |
| 301 redirects for overlapping URLs | `src/lib/seo/redirects.ts` |
| Structured data (Organization, WebSite, SoftwareApplication, WebApplication, BreadcrumbList, FAQPage, Article) | `src/lib/structured-data.ts`, `src/lib/seo/jsonld.ts`, `src/lib/seo/page-graph.ts` |
| Structured data validation | `src/lib/seo/validate-jsonld.ts`, run in tests and in the crawl |
| IndexNow (Bing and others) | `src/lib/indexnow.ts`, `src/lib/indexnow-store.ts`; key file at `/{key}.txt`; log on `/admin/seo/inventory` |
| SEO health page | `/admin/seo` |
| SEO inventory (every indexable page, its keyword, intent, type and status; CSV export) | `/admin/seo/inventory` |
| First-party signup attribution | `src/lib/seo/attribution.ts` |
| Google Analytics 4 (optional) | `src/components/analytics/google-analytics.tsx` |

## The pages

Landing, tool, comparison and use-case pages are Markdown files with frontmatter, in folders by kind:

```
content/pages/
  solutions/      /online-esignature, /free-esignature, …
  tools/          /sign-pdf, /add-signature-to-pdf, …  (the working tool is mounted above the text)
  compare/        /vs/docusign, …
  alternatives/   /alternatives/docusign
  use-cases/      /esignature-for/real-estate, …
```

Guides live in `content/blog` (see [the blog guide](./blog.md)); a post's `related:` frontmatter links it to the pages it supports.

Write `{site}` wherever the product name belongs. It is filled in from `siteConfig`, so the pages follow a rebrand.

### Adding a page without creating a duplicate

Each page owns one search intent: its `primaryKeyword`, plus the `aliases` that mean the same thing. Before writing a page for a new query, check whether an existing page already owns that intent. If it does, add the query to that page's `aliases` and, if people are likely to type the URL, add a redirect in `src/lib/seo/redirects.ts`. Two pages competing for one query hurt both.

`npm test` holds every page to these rules (`src/lib/seo/pages.test.ts`):

- unique title, description, H1 and primary keyword, and no intent owned twice;
- a minimum amount of running text (450 words for solutions, 300 for tools plus their steps and FAQs, 500 for comparisons);
- no two pages, or a page and a blog post, sharing more than 12% of their five-word phrases;
- at least three related links, all to pages that exist;
- comparisons name their competitor, cite their sources and say when the facts were checked.

When the test fails on content, fix the content. The numbers are deliberate.

### Comparisons stay factual

Only state what the other company publishes, link the source in `sources:`, and update `checked:` whenever you re-check. Say where the competitor is stronger. Prices change: re-check comparison pages at least every quarter.

## International

A translation is a file beside the English one: `content/pages/tools/sign-pdf.it.md`. Only translated pages get a localized URL, hreflang alternates and a sitemap entry in that language, so the same text is never published at two addresses. With a single locale the root layout does not read the request, which keeps the public pages static (`src/i18n/static-locale.ts`).

## After deploying

1. **Set `NEXT_PUBLIC_APP_URL`** to the public `https://` address. Canonicals, the sitemap and structured data are built from it.
2. **Google Search Console.** Add the site as a property. Verify by DNS, or paste the meta tag's content into `GOOGLE_SITE_VERIFICATION`. Submit `https://yourdomain.com/sitemap.xml` under Sitemaps.
3. **Bing Webmaster Tools.** Import the site from Search Console, or verify with `BING_SITE_VERIFICATION`. Submit the same sitemap.
4. **IndexNow** is already on when `CRON_SECRET` is set. The first request a production deployment serves submits every sitemap URL that is new or changed since it was last accepted, in the background. The daily cron does the same as a safety net. Every submission and the status it got back is listed on `/admin/seo/inventory`. Submission asks engines to crawl; it does not guarantee indexing.
5. **Open `/admin/seo`** and run a crawl. Fix anything marked as an error. The crawl also requests every internal link once and reports any that is broken.
6. **Open `/admin/seo/inventory`.** It is built from the sitemap and the page data on every load. "Published but not in the sitemap" and "Keyword conflicts" should both be 0.

## Analytics

- **Search queries, impressions and rankings** come only from Search Console and Bing Webmaster Tools. No site can see the query a visitor typed.
- **Signups by channel** are recorded first-party. The first time someone lands on a public page, a cookie (`sx_src`, 30 days) records the landing path, the referrer's host and any `utm_*` tags. Nothing is recorded when the browser sends Global Privacy Control or Do Not Track. When an account is created, the server stores that and its channel on the user. `/admin/seo` shows signups per channel and the landing pages of organic signups.
- **Google Analytics 4** loads only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, after the page is idle, and the Content-Security-Policy allows Google's hosts only then. It receives page views and these events: `tool_opened`, `tool_downloaded`, `cta_clicked` and `sign_up` (with the channel). Never send file names, emails or document content to analytics. GA sets cookies, so it runs in Consent Mode v2 behind a consent banner (`src/lib/analytics-consent.ts`): every storage type is denied until the visitor accepts, only analytics storage is ever granted, and the footer's "Cookie settings" reopens the banner. Like PostHog it never runs on signing pages or when the browser sends Global Privacy Control or Do Not Track, and page addresses are scrubbed the same way. Page views are sent by the app on every navigation, client-side ones included, so in the GA web stream turn **off** Enhanced measurement → "Page changes based on browser history events", or each client-side navigation counts twice. Visits from people who decline are not in GA's reports (Google only models them once enough visitors accept); Vercel Analytics and PostHog still count everyone.
- **The admin Traffic tab** (`/admin/analytics/traffic`) reads GA back through the Data API: visitors per day for a chosen range, top pages, sources, devices, and the `sign_up` and `document_sent` events. Set `GA4_PROPERTY_ID` (the property's number) and `GA_SERVICE_ACCOUNT_KEY_BASE64` (a service account's JSON key, base64-encoded, with the Data API enabled and the account a Viewer on the property). Answers are cached for five minutes. The page says it may undercount visitors who declined cookies, and it does; the Growth tab's signups come from the database and are complete.
- **Vercel Analytics** receives the same events when it is mounted (custom events need a Vercel plan that includes them).
- **PostHog** loads only when `NEXT_PUBLIC_POSTHOG_KEY` is set (`NEXT_PUBLIC_POSTHOG_HOST` picks the US or EU cloud), after the page is idle, and the Content-Security-Policy allows its ingest host only then. It receives page views with their `utm_*` tags, the events above, and `document_sent` (with `via`: `quick_send` or `editor`), which ends the signup-to-first-document funnel. It runs cookieless: no cookie, no browser storage, nobody identified, no autocapture or session recording, and never on signing pages. Turn on cookieless mode in the PostHog project's settings too, or it drops the events. Page addresses are scrubbed before they leave: every query parameter except `utm_*` is removed, and a signing token in the path is replaced.

### Measuring outreach

Every link you post yourself carries `utm_*` tags, so each channel shows up separately in PostHog and on `/admin/seo`. A DM has no referrer at all, so without tags it counts as a direct visit. Use the same lowercase values every time:

| Channel | `utm_source` | `utm_medium` |
|---|---|---|
| Direct messages | `dm` (or the platform: `linkedin`, `whatsapp`) | `dm` |
| Reddit | `reddit` | `social` |
| Product Hunt | `producthunt` | `referral` |
| X, LinkedIn posts | `x`, `linkedin` | `social` |
| Newsletter or email | the list's name | `email` |

Add `utm_campaign` for the push it belongs to (`launch`, `pricing-post`). Example: `https://salsox.com/?utm_source=reddit&utm_medium=social&utm_campaign=launch`. The first tagged visit is the one a signup is attributed to.

## SEO agent

A daily job (`/api/cron/seo-agent`, 05:00 UTC) that writes one new page of a type with conversion data behind it: a document template, a comparison or alternatives page, or an e-signature law page. The code is a self-contained module in `src/lib/seo-agent`; only `site.ts`, `blog-posts.ts` and `published-pages.ts` touch the rest of the app. The tab is `/admin/seo/agent`, under Analytics.

### Page mode (the default)

1. **Picks a candidate.** `page-queue.ts` lists what may be written, each with the facts it needs: templates the library lacks (with their category, roles and the situation they serve), competitors with their pricing pages, and countries with verified statute facts (Ghana's Electronic Transactions Act, 2008 (Act 772), section by section). Law pages go first, then templates and competitor pages alternate. A candidate the site already covers (same path, or a page owning its keyword) is skipped.
2. **Gathers facts.** A comparison fetches the competitor's pricing page that day; a round-up needs at least two readable sources. With too few, the page is not generated and the run says why.
3. **Writes the page.** Claude gets the facts it may state and nothing else, the intros of the neighbouring pages (so its own is written to differ), and the paths it may link to.
4. **Quality gates** (`quality.ts`). *Required data*: every field filled, no placeholder text, no empty section, and the same schema and rules the file pages are held to. *Specific intro*: compared with the neighbours' intros after masking the names, so a swapped-name intro fails. *Linked into its hub*: at least three real related pages, one in its own hub. *Verified law only* (law pages): every statute and section cited is one of the verified facts. A page failing any of these gets one retry with the reasons, then is not generated. *Not a duplicate*: the body is compared with every existing page; too close and the page is saved **flagged and noindexed**, listed in the tab's duplicate report, and never published on its own.
5. **Draft or publish.** The first three pages are drafts for review; after that, pages that pass every gate publish themselves unless "Review every page" is chosen. Published pages live in the database and appear wherever the file pages do: the template library and its category, industry and team pages, the dashboard's templates, `/compare`, `/esignature-law`, the sitemap and `/llms.txt`. Comparison, alternatives and law pages also link to their neighbours in the hub, so every page has links in. A flagged page published by hand goes live noindexed, outside the sitemap and hubs.

Setup: `ANTHROPIC_API_KEY` and `CRON_SECRET`; apply the migration (`npx prisma migrate deploy`) first.

### Article mode (off)

The original daily run: a blog article for a search query the site already appears for but does not get clicks on. Switched off because those articles brought visits that did not convert; set `SEO_AGENT_MODE=articles` to turn it back on. Articles it already published stay live and are managed in the tab.

1. **Finds opportunities.** It reads the Search Console property's queries and pages for the last 90 days (ending three days ago, where final data ends). A query qualifies with at least `SEO_AGENT_MIN_IMPRESSIONS` impressions (default 50), an average position from 11 to 50, at most one click, and not a search for the brand. Queries are ranked by missed clicks: impressions times how far their click-through rate falls below what their position normally earns.
2. **Skips what is covered.** A query is skipped when a blog post, landing, tool or comparison page, template, or an earlier target already covers it (same words, or nearly). Every picked query is stored in `seo_agent_targets` and never picked again.
3. **Writes the article.** Claude (`SEO_AGENT_MODEL`, default Claude Opus 5.5) gets the product summary, the existing categories, the pages it may link to and one or two existing posts as style references. It returns a direct answer first, question-style sections, an FAQ and two or three related pages. A draft that fails the checks in `article.ts` (length, headings, unknown links) gets one retry, then the run is marked failed. Each article carries Article, FAQPage and SoftwareApplication structured data built from its own fields.
4. **Draft or publish.** The first three articles are always drafts: read one with "Read draft", then Publish or Discard. From the fourth on, articles publish themselves and are still logged, unless "Review every article" is chosen in the tab. Articles live in the database and appear everywhere a file post does: the blog, categories, the feed, the sitemap and `/llms.txt`. Unpublish takes one back to draft.
5. **Links to it.** On publish, one sentence linking to the article is added to two or three of the busiest pages (Google Analytics page views for 30 days; Search Console clicks when GA is not connected) that are blog posts or registry pages and do not already link to it. Claude writes the sentence and picks the paragraph; the sentence is stored and spliced in when the page renders, so the page's file is never edited.
6. **Finds orphan pages.** A weekly crawl (`/api/cron/seo-agent/orphans`, Mondays) fetches every sitemap page and lists the ones no other page links to. They are only listed, for a person to fix and mark reviewed.

Setup (article mode): `GA_SERVICE_ACCOUNT_KEY_BASE64` (the same key as the Traffic tab) with that service account added as a user on the Search Console property, `ANTHROPIC_API_KEY`, and `CRON_SECRET`. `SEARCH_CONSOLE_SITE_URL` names the property if it is not the site's own URL with a trailing slash (a domain property is `sc-domain:example.com`). Apply the migration (`npx prisma migrate deploy`) before the first run. Both jobs can also be started from the tab.

## Testing

- `npm test` covers the content rules, structured data, redirects, sitemap inputs, attribution and the audit rules.
- `npx playwright test e2e/seo.spec.ts` crawls the running site: robots.txt, the sitemap, every sitemap URL (status, canonical, metadata, one H1, structured data, alt text, leaked secrets), redirects, the 404 page, private pages, and that every sitemap URL is reachable by following links from the homepage.
- `e2e/responsive.spec.ts` checks the public pages, including every tool, at 360px and 390px.
- For Core Web Vitals, run Lighthouse in mobile mode against a production build (`npm run build && npm start`), and watch real-user data in Search Console's Core Web Vitals report once there is traffic.
