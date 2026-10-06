/**
 * Tests for the deployment crawl (crawl.ts) with a fake fetch: pages are
 * fetched from the deployment's own origin but judged against the sitemap's
 * URLs, redirects in the sitemap are reported, and a private page without
 * noindex is an error.
 */
import { describe, expect, it } from "vitest"
import { crawlSite, PRIVATE_PATHS } from "./crawl"

const good = (canonical: string) =>
  `<html lang="en"><head><meta name="viewport" content="x"/><title>Title for ${canonical}</title><meta name="description" content="A description that is long enough to pass the length check for ${canonical}."/><link rel="canonical" href="${canonical}"/><meta property="og:title" content="t"/><meta property="og:image" content="https://site.test/og.png"/><meta name="twitter:card" content="summary"/></head><body><h1>H</h1></body></html>`

function fakeFetch(routes: Record<string, { status: number; html?: string; headers?: Record<string, string> }>) {
  const seen: string[] = []
  const impl = (async (input: string) => {
    seen.push(input)
    const path = new URL(input).pathname
    const r = routes[path] ?? { status: 404 }
    return new Response(r.html ?? "", { status: r.status, headers: r.headers })
  }) as unknown as typeof fetch
  return { impl, seen }
}

const privateOk = Object.fromEntries(PRIVATE_PATHS.map((p) => [p, { status: 307 }]))

describe("crawlSite", () => {
  it("fetches from the deployment origin and judges against the sitemap URL", async () => {
    const { impl, seen } = fakeFetch({ ...privateOk, "/sign-pdf": { status: 200, html: good("https://site.test/sign-pdf") } })
    const result = await crawlSite({ origin: "https://preview.test", sitemapUrls: ["https://site.test/sign-pdf"], fetchImpl: impl })
    expect(seen[0]).toBe("https://preview.test/sign-pdf")
    expect(result.issues.filter((i) => i.severity === "error")).toEqual([])
    expect(result.privatePages.every((p) => p.protected)).toBe(true)
  })

  it("reports a sitemap URL that redirects, and a private page left indexable", async () => {
    const { impl } = fakeFetch({ ...privateOk, "/old": { status: 301 }, "/login": { status: 200, html: good("https://preview.test/login") } })
    const result = await crawlSite({ origin: "https://preview.test", sitemapUrls: ["https://site.test/old"], fetchImpl: impl })
    const messages = result.issues.map((i) => `${i.url} ${i.message}`)
    expect(messages).toContain("https://site.test/old answers 301")
    expect(messages).toContain("/login private page is indexable (no noindex)")
  })

  it("accepts a private page that answers 200 with a noindex header", async () => {
    const { impl } = fakeFetch({ ...privateOk, "/signup": { status: 200, html: good("x"), headers: { "x-robots-tag": "noindex, nofollow" } } })
    const result = await crawlSite({ origin: "https://preview.test", sitemapUrls: [], fetchImpl: impl })
    expect(result.privatePages.find((p) => p.path === "/signup")).toMatchObject({ protected: true, status: 200 })
  })
})
