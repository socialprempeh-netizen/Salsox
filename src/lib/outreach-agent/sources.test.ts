import { describe, expect, it } from "vitest"
import { COMPETITORS, competitorIn, redditQueries, reviewPages } from "./sources"

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
  it("asks two questions per competitor", () => {
    const queries = redditQueries()
    expect(queries).toHaveLength(COMPETITORS.length * 2)
    expect(queries[0].query).toBe('"DocuSign" alternative')
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
