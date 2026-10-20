/**
 * The opportunity rules: rows fold into one per query, only pages two to
 * five with near-zero clicks qualify, and ranking follows missed clicks.
 */
import { describe, expect, it } from "vitest"
import { aggregateByQuery, expectedCtr, isWritableQuery, normalizeQuery, rankOpportunities, DEFAULT_RULES, type SearchRow } from "./opportunities"

const row = (query: string, impressions: number, position: number, clicks = 0, page = "https://site.test/a"): SearchRow => ({ query, page, impressions, position, clicks })

describe("expectedCtr", () => {
  it("falls with position, smoothly across the page-one boundary", () => {
    expect(expectedCtr(1)).toBeCloseTo(0.28)
    expect(expectedCtr(3.5)).toBeCloseTo(0.085)
    expect(expectedCtr(10)).toBeCloseTo(0.018)
    expect(expectedCtr(11)).toBeLessThan(expectedCtr(10))
    expect(expectedCtr(20)).toBeGreaterThan(expectedCtr(50))
    expect(expectedCtr(50)).toBeGreaterThan(0)
  })

  it("treats a missing position as the top", () => {
    expect(expectedCtr(0)).toBe(0.28)
    expect(expectedCtr(Number.NaN)).toBe(0.28)
  })
})

describe("normalizeQuery", () => {
  it("lower-cases, collapses spaces and trims punctuation", () => {
    expect(normalizeQuery("  How to Sign a PDF?  ")).toBe("how to sign a pdf")
    expect(normalizeQuery("e’signature")).toBe("e'signature")
  })
})

describe("aggregateByQuery", () => {
  it("sums across pages, weights position by impressions and keeps the busiest page", () => {
    const [q] = aggregateByQuery([row("Sign PDF", 300, 12, 1, "https://site.test/a"), row("sign pdf", 100, 20, 0, "https://site.test/b")])
    expect(q.query).toBe("sign pdf")
    expect(q.impressions).toBe(400)
    expect(q.clicks).toBe(1)
    expect(q.position).toBeCloseTo(14)
    expect(q.page).toBe("https://site.test/a")
    expect(q.pages).toBe(2)
  })

  it("drops rows with no impressions or no query", () => {
    expect(aggregateByQuery([row("", 10, 12), row("x y z", 0, 12)])).toEqual([])
  })
})

describe("isWritableQuery", () => {
  it("rejects brand searches, operators, addresses and very long or short queries", () => {
    expect(isWritableQuery("salsox login", ["salsox"])).toBe(false)
    expect(isWritableQuery("site:example.com sign", [])).toBe(false)
    expect(isWritableQuery("www.example.com", [])).toBe(false)
    expect(isWritableQuery("ab", [])).toBe(false)
    expect(isWritableQuery("one two three four five six seven eight nine ten eleven", [])).toBe(false)
    expect(isWritableQuery("how to sign a lease online", ["salsox"])).toBe(true)
  })
})

describe("rankOpportunities", () => {
  const rules = { ...DEFAULT_RULES, brandTerms: ["salsox"] }

  it("keeps positions 11 to 50 with enough impressions and near-zero clicks", () => {
    const ranked = rankOpportunities(
      [
        row("page one query", 500, 4),
        row("page two query", 500, 14),
        row("too deep query", 500, 60),
        row("too few impressions", 20, 15),
        row("already clicked query", 500, 15, 9),
        row("salsox pricing", 500, 15),
      ],
      rules
    )
    expect(ranked.map((o) => o.query)).toEqual(["page two query"])
  })

  it("ranks by missed clicks: impressions times the CTR gap for the position", () => {
    const ranked = rankOpportunities([row("deep but big", 2000, 45), row("close and medium", 600, 12), row("close and small", 100, 12)], rules)
    expect(ranked.map((o) => o.query)).toEqual(["close and medium", "deep but big", "close and small"])
    const top = ranked[0]
    expect(top.score).toBeCloseTo(600 * (expectedCtr(12) - 0))
  })

  it("breaks score ties by position", () => {
    const ranked = rankOpportunities([row("b query", 100, 20), row("a query", 100, 20)], rules)
    expect(ranked.map((o) => o.query)).toEqual(["a query", "b query"])
  })
})
