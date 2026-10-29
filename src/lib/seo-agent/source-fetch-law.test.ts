/**
 * Reading statute pages for the law pages: in the charset the page declares
 * (German statute pages are ISO-8859-1), with the real network cause in the
 * reason, one retry after a transient failure, and the site's crawler as a
 * second route to the same official page.
 */
import { describe, expect, it, vi } from "vitest"
import { decodeHtml, fetchErrorReason, fetchFullText } from "./source-fetch"

const latin1 = (text: string) => Uint8Array.from([...text].map((c) => c.charCodeAt(0)))
const words = (n: number) => Array.from({ length: n }, (_, i) => `Wort${i}`).join(" ")
const page = (body: string) => `<html><head><meta charset="iso-8859-1"></head><body><p>${body}</p></body></html>`

describe("decodeHtml", () => {
  it("reads an ISO-8859-1 page with its umlauts intact", () => {
    expect(decodeHtml(latin1(page("Die Erteilung der Anerkennungserklärung")), "text/html")).toContain("Anerkennungserklärung")
    expect(decodeHtml(latin1("<p>Bürgschaft</p>"), "text/html; charset=ISO-8859-1")).toContain("Bürgschaft")
  })

  it("falls back to UTF-8 for an unknown charset", () => {
    expect(decodeHtml(new TextEncoder().encode("<meta charset=\"x-made-up\"><p>Straße</p>"), null)).toContain("Straße")
  })
})

describe("fetchErrorReason", () => {
  it("names the network cause Node's fetch hides behind 'fetch failed'", () => {
    expect(fetchErrorReason(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))).toBe("fetch failed (ECONNRESET)")
    expect(fetchErrorReason(Object.assign(new Error("aborted"), { name: "TimeoutError" }))).toBe("timed out after 30 seconds")
  })
})

describe("fetchFullText", () => {
  const ok = () => new Response(latin1(page(`Bürgerliches Gesetzbuch ${words(40)}`)), { headers: { "content-type": "text/html" } })

  it("tries a transient failure once more", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } })).mockResolvedValueOnce(ok())
    const result = await fetchFullText({ url: "https://example.org/a" }, fetcher, { retryAfterMs: 0 })
    expect(result.ok).toBe(true)
    expect(result.text).toContain("Bürgerliches")
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("does not retry a 404", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 404 }))
    expect(await fetchFullText({ url: "https://example.org/a" }, fetcher, { retryAfterMs: 0 })).toEqual({ ok: false, text: "", reason: "HTTP 404" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("reads the same page through the crawler when it cannot be reached directly", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))
    const viaCrawler = vi.fn().mockResolvedValue(`§ 126a Elektronische Form ${words(40)}`)
    const result = await fetchFullText({ url: "https://www.gesetze-im-internet.de/bgb/__126a.html" }, fetcher, { retryAfterMs: 0, viaCrawler })
    expect(viaCrawler).toHaveBeenCalledWith("https://www.gesetze-im-internet.de/bgb/__126a.html")
    expect(result).toMatchObject({ ok: true })
  })

  it("reports both routes when neither works", async () => {
    const fetcher = vi.fn().mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))
    const result = await fetchFullText({ url: "https://example.org/a" }, fetcher, { retryAfterMs: 0, viaCrawler: async () => null })
    expect(result.reason).toBe("fetch failed (ECONNRESET); through the crawler: not readable")
  })
})
