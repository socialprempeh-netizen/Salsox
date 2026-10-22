import { describe, expect, it } from "vitest"
import { fetchSource, htmlToText, MIN_SOURCE_WORDS } from "./source-fetch"

describe("htmlToText", () => {
  it("keeps visible text and drops scripts, styles and markup", () => {
    const html = `<html><head><style>.a{color:red}</style><script>var price = 999</script></head><body><h1>Plans</h1><p>Starter &amp; Pro: &euro;9 per&nbsp;user</p><!-- hidden --><ul><li>Unlimited</li></ul></body></html>`
    expect(htmlToText(html)).toBe("Plans\nStarter & Pro: €9 per user\nUnlimited")
  })
})

describe("fetchSource", () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ")
  const fake = (status: number, body: string) => (async () => new Response(body, { status })) as unknown as typeof fetch

  it("returns a readable page's text", async () => {
    const result = await fetchSource({ label: "Pricing", url: "https://example.com/pricing" }, fake(200, `<p>${words(MIN_SOURCE_WORDS + 10)}</p>`))
    expect(result.ok).toBe(true)
    expect(result.text.startsWith("word0")).toBe(true)
  })

  it("reports a blocked, empty or unreachable page as unreadable, with why", async () => {
    expect(await fetchSource({ label: "P", url: "https://e.com" }, fake(403, "no"))).toMatchObject({ ok: false, reason: "HTTP 403" })
    expect((await fetchSource({ label: "P", url: "https://e.com" }, fake(200, "<div id=root></div>"))).reason).toMatch(/readable words/)
    const broken = (async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    expect(await fetchSource({ label: "P", url: "https://e.com" }, broken)).toMatchObject({ ok: false, reason: "network down" })
  })
})
