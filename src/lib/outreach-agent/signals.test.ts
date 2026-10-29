import { describe, expect, it } from "vitest"
import type { Fix } from "./fixes"
import { normalise, quoteAppearsIn, rejection, sourceKey } from "./signals"

const page = "## Reviews\n\n**Rated 1 of 5**\n\nWe pay “per envelope” and   the bill doubled when we added two people. Support never answered."
const catalogue: Fix[] = [{ id: "price", answers: ["pricing"], label: "Price", facts: "Unlimited documents." }]

describe("normalise", () => {
  it("lowercases, drops quotation marks and collapses space", () => {
    expect(normalise("We  pay “per” — *now*, don't")).toBe("we pay per - now, dont")
  })
})

describe("quoteAppearsIn", () => {
  it("finds a quote that is in the page, ignoring case, quotes and spacing", () => {
    expect(quoteAppearsIn('we pay "per envelope" and the bill doubled when we added two people', page)).toBe(true)
  })

  it("rejects a paraphrase", () => {
    expect(quoteAppearsIn("our bill doubled after adding two seats", page)).toBe(false)
  })

  it("rejects a quote too short to write around", () => {
    expect(quoteAppearsIn("Support never answered", page)).toBe(false)
  })
})

describe("sourceKey", () => {
  it("uses the review id when there is one", () => {
    expect(sourceKey("g2", "docusign", " 123 ", "x")).toBe("g2:docusign:123")
  })

  it("otherwise hashes the normalised quote, so spacing does not change it", () => {
    const a = sourceKey("trustpilot", "docusign", null, "The bill  doubled")
    expect(a).toBe(sourceKey("trustpilot", "docusign", null, "the bill doubled"))
    expect(a).toMatch(/^trustpilot:docusign:[0-9a-f]{20}$/)
  })
})

describe("rejection", () => {
  const quote = "We pay per envelope and the bill doubled when we added two people"
  const ctx = { source: "trustpilot" as const, page, catalogue }

  it("keeps a 1-2 star review with a real quote and a fix", () => {
    expect(rejection({ rating: 2, quote, complaint: "pricing" }, ctx)).toBeNull()
  })

  it("rejects reviews above two stars or without a rating", () => {
    expect(rejection({ rating: 3, quote, complaint: "pricing" }, ctx)).toBe("rating")
    expect(rejection({ rating: null, quote, complaint: "pricing" }, ctx)).toBe("rating")
  })

  it("does not need a rating for Reddit", () => {
    expect(rejection({ rating: null, quote, complaint: "pricing" }, { ...ctx, source: "reddit" })).toBeNull()
    expect(rejection({ rating: null, quote, complaint: "pricing" }, { ...ctx, source: "hackernews" })).toBeNull()
  })

  it("rejects an invented quote and a complaint with no fix", () => {
    expect(rejection({ rating: 1, quote: "DocuSign is far too expensive for a small team", complaint: "pricing" }, ctx)).toBe("quote")
    expect(rejection({ rating: 1, quote, complaint: "mobile" }, ctx)).toBe("noFix")
  })
})
