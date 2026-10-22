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

describe("whole statute texts", () => {
  it("reads a Word 97 file's text from its bytes, in either encoding", async () => {
    const { docText } = await import("./source-fetch")
    const eight = new Uint8Array(Buffer.from("\u0000\u0001binary 11 (1) A legal requirement that a document be signed is satisfied by an electronic signature.\u0000", "latin1"))
    const wide = new Uint8Array(Buffer.from("\u0000\u0001Wills and codicils.", "utf16le"))
    expect(docText(eight)).toContain("A legal requirement that a document be signed is satisfied by an electronic signature.")
    expect(docText(wide)).toContain("Wills and codicils.")
  })

  it("reads a .docx file's main document text", async () => {
    const { docxText } = await import("./source-fetch")
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    zip.file("word/document.xml", `<w:document><w:body><w:p><w:r><w:t>SECTION 7. LEGAL RECOGNITION</w:t></w:r></w:p><w:p><w:r><w:t>(d) If a law requires a signature, an electronic signature satisfies the law.</w:t></w:r></w:p></w:body></w:document>`)
    const text = await docxText(await zip.generateAsync({ type: "uint8array" }))
    expect(text.split("\n").map((line) => line.trim())).toEqual(["SECTION 7. LEGAL RECOGNITION", "(d) If a law requires a signature, an electronic signature satisfies the law."])
  })

  it("keeps a short statute section whole, and reports an empty shell", async () => {
    const { fetchFullText, MIN_LAW_WORDS } = await import("./source-fetch")
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ")
    const page = (body: string) => (async () => new Response(`<p>${body}</p>`, { status: 200 })) as unknown as typeof fetch
    const ok = await fetchFullText({ url: "https://e.org/s" }, page(words(MIN_LAW_WORDS + 5)))
    expect(ok).toMatchObject({ ok: true })
    expect(ok.text.split(" ")).toHaveLength(MIN_LAW_WORDS + 5)
    expect((await fetchFullText({ url: "https://e.org/s" }, page("Loading"))).ok).toBe(false)
  })
})
