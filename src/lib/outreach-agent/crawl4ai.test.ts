import { describe, expect, it } from "vitest"
import { MAX_MARKDOWN, crawlerCheckOutcome, crawlerConfigured, parseCrawlResponse } from "./crawl4ai"

describe("crawlerCheckOutcome", () => {
  const page = { url: "https://example.com/", ok: true, status: 200, markdown: "# Example Domain", error: null }

  it("reports a page read as success", () => {
    expect(crawlerCheckOutcome([page], 3)).toEqual({ ok: true, message: "The crawler read the test page in 3s (16 characters)." })
  })

  it("separates an unreachable server from a page it could not read", () => {
    expect(crawlerCheckOutcome(new Error("the Crawl4AI server answered HTTP 401"), 1).message).toMatch(/could not be reached: the Crawl4AI server answered HTTP 401/)
    expect(crawlerCheckOutcome([{ ...page, ok: false, error: "HTTP 403" }], 1)).toEqual({ ok: false, message: "The crawler answered, but could not read the test page (HTTP 403)." })
    expect(crawlerCheckOutcome([], 1).ok).toBe(false)
  })
})

describe("parseCrawlResponse", () => {
  it("reads markdown given as a string", () => {
    const [page] = parseCrawlResponse({ success: true, results: [{ url: "https://a.com", success: true, status_code: 200, markdown: "# Reviews" }] })
    expect(page).toEqual({ url: "https://a.com", ok: true, status: 200, markdown: "# Reviews", error: null })
  })

  it("prefers fit markdown, then raw, when markdown is an object", () => {
    expect(parseCrawlResponse({ results: [{ url: "u", markdown: { raw_markdown: "raw", fit_markdown: "fit" } }] })[0].markdown).toBe("fit")
    expect(parseCrawlResponse({ results: [{ url: "u", markdown: { raw_markdown: "raw", fit_markdown: "  " } }] })[0].markdown).toBe("raw")
  })

  it("marks failures with the server's reason or the HTTP status", () => {
    const [a, b, c] = parseCrawlResponse({
      results: [
        { url: "a", success: false, error_message: "Blocked by robots.txt", markdown: "" },
        { url: "b", success: true, status_code: 403, markdown: "Access denied" },
        { url: "c", success: true, markdown: "" },
      ],
    })
    expect(a).toMatchObject({ ok: false, error: "Blocked by robots.txt" })
    expect(b).toMatchObject({ ok: false, error: "HTTP 403" })
    expect(c).toMatchObject({ ok: false, error: "no text came back" })
  })

  it("caps the markdown length", () => {
    const [page] = parseCrawlResponse({ results: [{ url: "u", markdown: "x".repeat(MAX_MARKDOWN + 10) }] })
    expect(page.markdown).toHaveLength(MAX_MARKDOWN)
  })

  it("returns nothing for an unexpected shape", () => {
    expect(parseCrawlResponse(null)).toEqual([])
    expect(parseCrawlResponse({ results: "no" })).toEqual([])
  })
})

describe("crawlerConfigured", () => {
  it("needs CRAWL4AI_URL", () => {
    expect(crawlerConfigured({})).toBe(false)
    expect(crawlerConfigured({ CRAWL4AI_URL: " https://crawl.example.com " })).toBe(true)
  })
})
