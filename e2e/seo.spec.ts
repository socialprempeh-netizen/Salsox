import { test, expect } from "@playwright/test"
import { crawlSite, PRIVATE_PATHS } from "../src/lib/seo/crawl"
import { parseSitemap } from "../src/lib/seo/audit"

/**
 * A crawler's-eye audit of the running site, the check to run before calling
 * SEO work done (docs/seo.md):
 *
 * - robots.txt allows the public site, blocks the private areas and names the
 *   sitemap;
 * - every sitemap URL answers 200, is indexable, is canonical to itself, has
 *   a unique title and description, one H1, Open Graph tags, valid structured
 *   data, alt text on every image, and no secret or private link in its HTML
 *   (the rules in src/lib/seo/audit.ts, the same the admin page runs);
 * - private pages are not indexable;
 * - overlapping URLs 301 to the page that owns the intent, and an unknown URL
 *   is a real 404;
 * - every sitemap URL can be reached by following links from the homepage
 *   (no orphans), and no internal link leads to a 404.
 *
 * Sitemap URLs carry the configured public origin; they are fetched from the
 * test server and judged against their own URL, as a crawler would judge the
 * live site.
 */

test.describe.configure({ timeout: 300_000 })

test("robots.txt opens the public site, shuts the private areas and names the sitemap", async ({ request }) => {
  const res = await request.get("/robots.txt")
  expect(res.status()).toBe(200)
  const body = await res.text()
  expect(body).toMatch(/User-Agent: \*/i)
  expect(body).toMatch(/Allow: \//)
  for (const path of ["/dashboard", "/admin", "/api/", "/sign/"]) expect(body).toContain(`Disallow: ${path}`)
  expect(body).toMatch(/Sitemap: https?:\/\/\S+\/sitemap\.xml/)
})

test("every sitemap URL passes the crawler audit, and private pages stay private", async ({ request, baseURL }) => {
  const xml = await (await request.get("/sitemap.xml")).text()
  const entries = parseSitemap(xml)
  expect(entries.length).toBeGreaterThan(30)
  // Real lastmod dates on the pages that change: every registry page and post.
  for (const e of entries.filter((e) => /\/(sign-pdf|compare\/docusign|blog\/how-to-sign-a-pdf)$/.test(e.loc))) expect(e.lastmod).toBeTruthy()

  // One page at a time: against the dev server, several cold routes compiling
  // at once can race on its manifests and answer 500. A deployment does not.
  const result = await crawlSite({ origin: baseURL!, sitemapUrls: entries.map((e) => e.loc), concurrency: 1, timeoutMs: 120_000 })
  const errors = result.issues.filter((i) => i.severity === "error").map((i) => `${i.url}: ${i.message}`)
  expect(errors, errors.join("\n")).toEqual([])
  expect(result.privatePages.map((p) => p.path).sort()).toEqual([...PRIVATE_PATHS].sort())

  // Structured data a page promises is there.
  const byPath = (suffix: string) => result.pages.find((p) => p.url.endsWith(suffix))!
  expect(byPath("/sign-pdf").jsonLdTypes).toEqual(expect.arrayContaining(["WebApplication", "BreadcrumbList", "FAQPage", "WebPage"]))
  expect(byPath("/compare/docusign").jsonLdTypes).toEqual(expect.arrayContaining(["BreadcrumbList", "FAQPage"]))
  expect(byPath("/blog/how-to-sign-a-pdf").jsonLdTypes).toEqual(expect.arrayContaining(["Article", "BreadcrumbList", "FAQPage"]))
})

test("overlapping URLs redirect permanently, and unknown URLs are real 404s", async ({ request }) => {
  for (const [from, to] of [
    ["/sign-pdf-online", "/sign-pdf"],
    ["/docusign-alternative", "/alternatives/docusign"],
    ["/vs/hellosign", "/compare/dropbox-sign"],
    ["/resources", "/blog"],
  ]) {
    const res = await request.get(from, { maxRedirects: 0 })
    expect(res.status(), from).toBe(301)
    expect(new URL(res.headers()["location"], "http://x").pathname).toBe(to)
  }
  const missing = await request.get("/this-is-not-a-page-at-all")
  expect(missing.status()).toBe(404)
  expect(await missing.text()).toMatch(/noindex/)
})

test("every sitemap URL is reachable from the homepage, and no internal link is broken", async ({ request }) => {
  const xml = await (await request.get("/sitemap.xml")).text()
  const wanted = new Set(parseSitemap(xml).map((e) => new URL(e.loc).pathname))
  const seen = new Set<string>()
  const queue = ["/"]
  const broken: string[] = []
  const linkTargets = new Set<string>()

  // Breadth-first over public pages, the way a crawler discovers a site.
  while (queue.length > 0 && seen.size < 400) {
    const path = queue.shift()!
    if (seen.has(path)) continue
    seen.add(path)
    const res = await request.get(path, { maxRedirects: 0 })
    if (res.status() !== 200) continue
    const html = await res.text()
    for (const m of html.matchAll(/<a\b[^>]*\shref="(\/[^"#?]*)/g)) {
      const target = m[1].replace(/\/+$/, "") || "/"
      if (target.startsWith("/_next") || target.startsWith("/api")) continue
      linkTargets.add(target)
      if (wanted.has(target) && !seen.has(target)) queue.push(target)
    }
  }

  const orphans = [...wanted].filter((p) => !seen.has(p))
  expect(orphans, `not linked from anywhere reachable: ${orphans.join(", ")}`).toEqual([])

  for (const target of linkTargets) {
    const status = (await request.get(target, { maxRedirects: 0 })).status()
    if (status === 404 || status >= 500) broken.push(`${target} -> ${status}`)
  }
  expect(broken, broken.join("\n")).toEqual([])
})
