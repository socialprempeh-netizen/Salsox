/**
 * Tests for the crawler audit (audit.ts): facts are read the way a crawler
 * would read them, and each rule fires on the mistake it exists for.
 */
import { describe, expect, it } from "vitest"
import { auditPages, extractPageFacts, isIndexable, parseSitemap } from "./audit"

const headers = (h: Record<string, string> = {}) => ({ get: (n: string) => h[n.toLowerCase()] ?? null })

function page({ title = "Sign a PDF online | Acme", description = "Sign a PDF in your browser for free. Draw or type your signature, place it, and download the signed file.", canonical = "https://acme.test/sign-pdf", h1 = "<h1>Sign a PDF</h1>", extraHead = "", body = "" } = {}) {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width"/><title>${title}</title>
<meta name="description" content="${description}"/><link rel="canonical" href="${canonical}"/>
<meta property="og:title" content="${title}"/><meta property="og:image" content="https://acme.test/og.png"/><meta name="twitter:card" content="summary_large_image"/>${extraHead}
</head><body>${h1}<a href="/pricing">Pricing</a><a href="https://other.test/x">out</a><a href="mailto:a@b.c">m</a>${body}</body></html>`
}

describe("extractPageFacts", () => {
  it("reads what a crawler reads", () => {
    const f = extractPageFacts(page(), "https://acme.test/sign-pdf", 200, headers())
    expect(f).toMatchObject({ title: "Sign a PDF online | Acme", canonical: "https://acme.test/sign-pdf", lang: "en", h1: ["Sign a PDF"], viewport: true })
    expect(f.internalLinks).toEqual(["/pricing"])
    expect(isIndexable(f)).toBe(true)
  })

  it("finds noindex in the meta tag or the header", () => {
    expect(isIndexable(extractPageFacts(page({ extraHead: '<meta name="robots" content="noindex, nofollow"/>' }), "https://acme.test/x", 200, headers()))).toBe(false)
    expect(isIndexable(extractPageFacts(page(), "https://acme.test/x", 200, headers({ "x-robots-tag": "noindex" })))).toBe(false)
  })

  it("flags secrets and private links in public HTML", () => {
    const f = extractPageFacts(page({ body: 'sk_live_abcdefghijkl <a href="/sign/AbCdEfGhIjKlMnOpQrStUvWxYz012345">x</a>' }), "https://acme.test/x", 200, headers())
    expect(f.leaks).toEqual(["a Stripe secret key", "a signing link with its token"])
  })
})

describe("auditPages", () => {
  const facts = (html: string, url: string, status = 200) => extractPageFacts(html, url, status, headers())

  it("passes a good page", () => {
    expect(auditPages([facts(page(), "https://acme.test/sign-pdf")]).filter((i) => i.severity === "error")).toEqual([])
  })

  it("catches a canonical pointing elsewhere, a missing H1 and a noindexed sitemap URL", () => {
    const bad = facts(page({ canonical: "https://acme.test/other", h1: "", extraHead: '<meta name="robots" content="noindex"/>' }), "https://acme.test/sign-pdf")
    const messages = auditPages([bad]).map((i) => i.message)
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(/canonical points elsewhere/), expect.stringMatching(/0 <h1>/), expect.stringMatching(/marked noindex/)]))
  })

  it("catches duplicate titles across indexable pages", () => {
    const issues = auditPages([facts(page(), "https://acme.test/a"), facts(page({ canonical: "https://acme.test/b" }), "https://acme.test/b")])
    expect(issues.some((i) => /title .* is shared/.test(i.message))).toBe(true)
  })

  it("reports a non-200 page", () => {
    expect(auditPages([facts("", "https://acme.test/gone", 404)])[0]).toMatchObject({ severity: "error", message: "answers 404" })
  })
})

describe("parseSitemap", () => {
  it("reads loc and lastmod", () => {
    const xml = `<urlset><url><loc>https://acme.test/</loc></url><url><loc>https://acme.test/blog/a</loc><lastmod>2026-10-01T00:00:00.000Z</lastmod></url></urlset>`
    expect(parseSitemap(xml)).toEqual([
      { loc: "https://acme.test/", lastmod: null },
      { loc: "https://acme.test/blog/a", lastmod: "2026-10-01T00:00:00.000Z" },
    ])
  })
})
