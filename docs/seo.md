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
- **Google Analytics 4** loads only when `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set, after the page is idle, and the Content-Security-Policy allows Google's hosts only then. It receives page views and these events: `tool_opened`, `tool_downloaded`, `cta_clicked` and `sign_up` (with the channel). Never send file names, emails or document content to analytics. GA sets cookies: depending on where your visitors are, you may need a consent banner before enabling it.
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

## Testing

- `npm test` covers the content rules, structured data, redirects, sitemap inputs, attribution and the audit rules.
- `npx playwright test e2e/seo.spec.ts` crawls the running site: robots.txt, the sitemap, every sitemap URL (status, canonical, metadata, one H1, structured data, alt text, leaked secrets), redirects, the 404 page, private pages, and that every sitemap URL is reachable by following links from the homepage.
- `e2e/responsive.spec.ts` checks the public pages, including every tool, at 360px and 390px.
- For Core Web Vitals, run Lighthouse in mobile mode against a production build (`npm run build && npm start`), and watch real-user data in Search Console's Core Web Vitals report once there is traffic.
