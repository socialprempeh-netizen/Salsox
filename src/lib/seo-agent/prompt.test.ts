/**
 * Prompts: the system prompt is stable (it is cached), the brief carries the
 * facts and paths the writer may use, and style references are chosen by
 * topic, then length.
 */
import { describe, expect, it } from "vitest"
import { articleSystemPrompt, articleUserPrompt, chooseStyleReferences, linkUserPrompt, type StyleReference } from "./prompt"

const ref = (title: string, words: number, hasFaq = true, keyword?: string): StyleReference => ({ title, markdown: `Body of ${title}`, words, hasFaq, keyword })

describe("chooseStyleReferences", () => {
  const posts = [ref("How to sign a PDF", 1300), ref("Are e-signatures legal", 1500), ref("Long but no FAQ", 3000, false), ref("Sign a lease online", 1000, true, "lease esignature")]

  it("prefers substantial posts with an FAQ, most on-topic first", () => {
    expect(chooseStyleReferences("lease signing online", posts).map((p) => p.title)).toEqual(["Sign a lease online", "Are e-signatures legal"])
  })

  it("falls back to the longest when nothing is on topic", () => {
    expect(chooseStyleReferences("zzz", posts).map((p) => p.title)).toEqual(["Are e-signatures legal", "How to sign a PDF"])
  })

  it("uses every post when too few are substantial", () => {
    expect(chooseStyleReferences("x", [ref("Short", 200, false)], 2)).toHaveLength(1)
  })
})

describe("articleSystemPrompt", () => {
  it("is the same for every run, so it caches", () => {
    expect(articleSystemPrompt("Acme")).toBe(articleSystemPrompt("Acme"))
    expect(articleSystemPrompt("Acme")).toMatch(/Never invent statistics/)
  })
})

describe("articleUserPrompt", () => {
  const brief = {
    siteName: "Acme",
    productSummary: "Acme signs PDFs.",
    keyword: "sign a lease",
    opportunity: { impressions: 420, position: 17.25, page: "https://acme.test/blog/x" },
    categories: ["Guides", "Legal"],
    paths: [{ path: "/sign-pdf", name: "Sign PDF", description: "A free tool." }],
    references: [ref("A \"quoted\" title", 1200)],
  }

  it("carries the query, its ranking, the facts, categories, paths and references", () => {
    const text = articleUserPrompt(brief)
    expect(text).toContain('"sign a lease"')
    expect(text).toContain("17.3 (page 2)")
    expect(text).toContain("Acme signs PDFs.")
    expect(text).toContain("Guides\nLegal")
    expect(text).toContain("- /sign-pdf: Sign PDF. A free tool.")
    expect(text).toContain(`title="A 'quoted' title"`)
    expect(text).not.toContain("previous attempt")
  })

  it("lists the reasons a previous attempt was rejected", () => {
    expect(articleUserPrompt({ ...brief, feedback: ["title too long"] })).toContain("- title too long")
  })
})

describe("linkUserPrompt", () => {
  it("numbers each page's paragraphs from zero", () => {
    const text = linkUserPrompt({ article: { title: "T", description: "D", href: "/blog/t" }, sources: [{ path: "/a", title: "A", paragraphs: ["First.", "Second."] }] })
    expect(text).toContain("[0] First.\n[1] Second.")
    expect(text).toContain('<page path="/a"')
  })
})
