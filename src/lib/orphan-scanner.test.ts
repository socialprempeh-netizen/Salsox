/**
 * Tests for the Orphan Page Scanner extension's scanning rules
 * (extensions/orphan-page-scanner/lib/scan.js). They live here because the
 * test runner reads src/; the module itself ships with the extension.
 */
import { describe, expect, it } from "vitest"
import { extractLinks, findOrphans, normalizeUrl, parseSitemap, sitemapsFromRobots, toCsv } from "../../extensions/orphan-page-scanner/lib/scan.js"

const origin = "https://example.com"

describe("normalizeUrl", () => {
  it("gives one form per page: no hash, no tracking, no trailing slash, sorted query", () => {
    expect(normalizeUrl("/pricing/#plans", origin, origin)).toBe("https://example.com/pricing")
    expect(normalizeUrl("https://example.com/blog/?utm_source=x&b=2&a=1", origin, origin)).toBe("https://example.com/blog?a=1&b=2")
    expect(normalizeUrl("/", origin, origin)).toBe("https://example.com/")
    expect(normalizeUrl("guides//one/", "https://example.com/blog/", origin)).toBe("https://example.com/blog/guides/one")
  })

  it("keeps only pages of the same site", () => {
    expect(normalizeUrl("https://other.com/a", origin, origin)).toBeNull()
    expect(normalizeUrl("http://example.com/a", origin, origin)).toBeNull()
    expect(normalizeUrl("/files/terms.pdf", origin, origin)).toBeNull()
    expect(normalizeUrl("mailto:a@b.c", origin, origin)).toBeNull()
  })
})

describe("sitemaps", () => {
  it("reads robots.txt's Sitemap lines", () => {
    expect(sitemapsFromRobots("User-agent: *\nDisallow: /admin\nSitemap: https://example.com/sitemap.xml\nsitemap:https://example.com/news.xml")).toEqual(["https://example.com/sitemap.xml", "https://example.com/news.xml"])
  })

  it("reads pages and nested sitemaps, entities and CDATA included", () => {
    const urlset = `<urlset><url><loc>https://example.com/</loc></url><url><loc><![CDATA[https://example.com/a?x=1&amp;y=2]]></loc><lastmod>2026-10-01</lastmod></url></urlset>`
    expect(parseSitemap(urlset)).toEqual({ pages: ["https://example.com/", "https://example.com/a?x=1&y=2"], sitemaps: [] })
    expect(parseSitemap(`<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>`)).toEqual({ pages: [], sitemaps: ["https://example.com/s1.xml"] })
  })
})

describe("extractLinks", () => {
  it("collects same-site page links, honouring <base> and skipping comments and the page itself", () => {
    const html = `<html><head><base href="/docs/"></head><body>
      <a href="intro">Intro</a> <a href='/pricing#plans'>Pricing</a> <a href=https://example.com/about>About</a>
      <a href="https://elsewhere.com/x">Out</a> <a href="#top">Top</a> <a href="mailto:hi@example.com">Mail</a>
      <!-- <a href="/hidden">Hidden</a> --> <a href="/docs/start">Self</a></body></html>`
    expect([...extractLinks(html, "https://example.com/docs/start", origin)].sort()).toEqual(["https://example.com/about", "https://example.com/docs/intro", "https://example.com/pricing"])
  })
})

describe("findOrphans", () => {
  it("reports listed pages no other page links to, and counts inbound links", () => {
    const listed = ["https://example.com/", "https://example.com/a", "https://example.com/b", "https://example.com/lonely"]
    const crawled = [
      { url: "https://example.com/", links: new Set(["https://example.com/a", "https://example.com/b"]) },
      { url: "https://example.com/a", links: new Set(["https://example.com/", "https://example.com/b"]) },
      // A page linking only to itself is still an orphan.
      { url: "https://example.com/lonely", links: new Set(["https://example.com/lonely"]) },
    ]
    const { orphans, inbound } = findOrphans(listed, crawled)
    expect(orphans).toEqual(["https://example.com/lonely"])
    expect(inbound.get("https://example.com/b")).toBe(2)
  })
})

describe("toCsv", () => {
  it("quotes cells that need it", () => {
    expect(toCsv([{ url: "https://example.com/a,b", inbound: 0, status: 200, orphan: true }])).toBe('url,inbound_links,status,orphan\n"https://example.com/a,b",0,200,yes')
  })
})

describe("the Claude skill's copy of the scanning rules", () => {
  it("is identical to the extension's, so the two tools never disagree", async () => {
    const fs = await import("node:fs")
    const path = await import("node:path")
    const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n")
    expect(read("claude-skills/orphan-page-scanner/skills/orphan-page-scanner/scripts/scan.js")).toBe(read("extensions/orphan-page-scanner/lib/scan.js"))
  })

  it("has the frontmatter a skill needs: a name and a description", async () => {
    const fs = await import("node:fs")
    const skill = fs.readFileSync("claude-skills/orphan-page-scanner/skills/orphan-page-scanner/SKILL.md", "utf8")
    const front = /^---\n([\s\S]*?)\n---/.exec(skill.replace(/\r\n/g, "\n"))?.[1] ?? ""
    expect(front).toMatch(/^name: orphan-page-scanner$/m)
    expect(/^description: (.+)$/m.exec(front)?.[1].length).toBeGreaterThan(80)
  })
})
