import { describe, expect, it } from "vitest"
import { COMPETITORS, PAIN_TOPICS, REDDIT_COMPETITORS, competitorIn, painIn, redditQueries, reviewPages } from "./sources"

describe("reviewPages", () => {
  it("builds one page per competitor and source it is listed on", () => {
    const pages = reviewPages()
    // Four on G2, three on Capterra (no Acrobat Sign), four on Trustpilot.
    expect(pages.filter((p) => p.source === "g2")).toHaveLength(4)
    expect(pages.filter((p) => p.source === "capterra")).toHaveLength(3)
    expect(pages.filter((p) => p.source === "trustpilot")).toHaveLength(4)
  })

  it("uses each site's public review URL", () => {
    const docusign = reviewPages([COMPETITORS[0]])
    expect(docusign.map((p) => p.url)).toEqual([
      "https://www.g2.com/products/docusign/reviews",
      "https://www.capterra.com/p/121506/Docusign/reviews/",
      "https://www.trustpilot.com/review/docusign.com?stars=1&stars=2",
    ])
  })

  it("can be limited to some sources", () => {
    expect(reviewPages(COMPETITORS, ["trustpilot"]).every((p) => p.source === "trustpilot")).toBe(true)
  })
})

describe("redditQueries", () => {
  it("asks once per pain topic, for DocuSign, PandaDoc and Dropbox Sign only", () => {
    const queries = redditQueries()
    expect(REDDIT_COMPETITORS.map((c) => c.id)).toEqual(["docusign", "pandadoc", "dropbox-sign"])
    expect(queries).toHaveLength(REDDIT_COMPETITORS.length * Object.keys(PAIN_TOPICS).length)
    expect(queries.map((q) => q.topic)).toContain("support")
  })

  it("quotes the tool and multi-word phrases", () => {
    const pricing = redditQueries().find((q) => q.competitor.id === "docusign" && q.topic === "pricing")
    expect(pricing?.query).toMatch(/^"DocuSign" \(expensive OR pricing OR "price increase" OR /)
  })
})

describe("painIn", () => {
  it("finds the topics a text touches", () => {
    expect(painIn("DocuSign hit us with a price increase and support never answered")).toEqual(["pricing", "support"])
    expect(painIn("We ran out of envelopes in March")).toEqual(["limits"])
  })

  it("matches whole words, with their endings", () => {
    // "capable" does not mean a cap, "costume" is not a cost.
    expect(painIn("a capable tool, nice costume")).toEqual([])
    expect(painIn("we cancelled after the limits changed")).toEqual(["pricing", "limits"])
  })
})

describe("competitorIn", () => {
  it("finds the one competitor named", () => {
    expect(competitorIn("Looking to leave DocuSign, any ideas?")?.id).toBe("docusign")
    expect(competitorIn("hellosign got pricey")?.id).toBe("dropbox-sign")
    expect(competitorIn("adobe sign is clunky")?.id).toBe("adobe-sign")
  })

  it("returns null for none or several", () => {
    expect(competitorIn("which e-signature tool?")).toBeNull()
    expect(competitorIn("DocuSign or PandaDoc?")).toBeNull()
  })
})
