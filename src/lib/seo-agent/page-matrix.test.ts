import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { STAT_IDS, statValue } from "@/lib/seo/stats"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import {
  COMPARED_INDUSTRIES,
  INDUSTRIES,
  MARKETS,
  MARKET_INDUSTRIES,
  MATRIX_COMPETITORS,
  PAGE_QUEUE,
  ROLES,
  industryCandidates,
  industryComparisonCandidates,
  industryPath,
  marketCandidates,
  roleCandidates,
  singleComparisonCandidates,
  threeWayCandidates,
} from "./page-matrix"
import { candidateFamily, candidateParent, candidatePath, pickBatch, pickCandidate, type PageCandidate } from "./page-queue"

const fileUseCases = fs.readdirSync(path.join(process.cwd(), "content", "pages", "use-cases")).filter((f) => /^[a-z0-9-]+\.md$/.test(f)).map((f) => f.replace(/\.md$/, ""))

describe("the dimensions", () => {
  it("tracks the ten competitors, each with a source to read", () => {
    expect(MATRIX_COMPETITORS.map((c) => c.id)).toEqual(["docusign", "pandadoc", "dropbox-sign", "adobe-acrobat-sign", "jotform-sign", "signnow", "signeasy", "zoho-sign", "signrequest", "nitro-sign"])
    for (const c of MATRIX_COMPETITORS) expect(c.sources.length).toBeGreaterThan(0)
  })

  it("marks exactly the file pages as existing, and gives every new industry its documents and angle", () => {
    expect(INDUSTRIES.filter((i) => i.existing).map((i) => i.slug).every((s) => fileUseCases.includes(s))).toBe(true)
    for (const i of INDUSTRIES.filter((i) => !i.existing)) {
      expect(fileUseCases).not.toContain(i.slug)
      expect(i.documents.length).toBeGreaterThanOrEqual(4)
      expect(i.angle.length).toBeGreaterThan(40)
    }
  })

  it("hangs every role, market and compared industry off an industry that exists", () => {
    const slugs = new Set(INDUSTRIES.map((i) => i.slug))
    for (const r of ROLES) expect(slugs.has(r.industry), r.slug).toBe(true)
    for (const s of [...MARKET_INDUSTRIES, ...COMPARED_INDUSTRIES]) expect(slugs.has(s), s).toBe(true)
  })

  it("covers the four target markets, and no cities", () => {
    expect(MARKETS.map((m) => m.id)).toEqual(["us", "uk", "canada", "germany"])
  })
})

describe("the generated candidates", () => {
  it("pairs every two competitors once for the three-way pages", () => {
    const pages = threeWayCandidates()
    expect(pages).toHaveLength(45)
    expect(pages[0]).toMatchObject({ slug: "docusign-vs-pandadoc", keyword: "docusign vs pandadoc", competitor: { name: "DocuSign" }, rival: { name: "PandaDoc" } })
    expect(new Set(pages.map((p) => p.slug)).size).toBe(45)
  })

  it("writes industry pages only for new industries, and role and market pages under their parents", () => {
    expect(industryCandidates().map((c) => c.slug)).not.toContain("real-estate")
    const role = roleCandidates().find((c) => c.slug === "leasing-agents")!
    expect(candidateParent(role)).toBe(industryPath("real-estate"))
    const market = marketCandidates().find((c) => c.slug === "real-estate-uk")!
    expect(market.market?.law.country).toBe("United Kingdom")
    expect(marketCandidates()).toHaveLength(MARKET_INDUSTRIES.length * MARKETS.length)
  })

  it("reads each industry comparison through its industry's documents, under its page", () => {
    const c = industryComparisonCandidates().find((p) => p.slug === "docusign-for-real-estate")!
    expect(c.keyword).toBe("docusign alternative for real estate")
    expect(candidateParent(c)).toBe("/esignature-for/real-estate")
    expect(industryComparisonCandidates()).toHaveLength(COMPARED_INDUSTRIES.length * MATRIX_COMPETITORS.length)
  })

  it("compares a competitor on its own only where nobody has yet", () => {
    expect(singleComparisonCandidates(new Set(["signeasy", "zoho-sign"])).map((c) => c.slug)).not.toContain("signeasy")
  })

  it("gives every candidate in the queue its own path and slug-safe URL", () => {
    const paths = PAGE_QUEUE.map(candidatePath)
    expect(new Set(paths).size).toBe(paths.length)
    for (const p of paths) expect(p).toMatch(/^\/[a-z-]+\/[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(PAGE_QUEUE.length).toBeGreaterThan(250)
  })
})

describe("picking a day's pages", () => {
  const none = () => false

  it("waits for a parent page to exist", () => {
    const role = roleCandidates()[0]
    expect(pickCandidate([role], [], none, () => false)).toBeNull()
    expect(pickCandidate([role], [], none, () => true)).toBe(role)
  })

  it("spreads a batch across families instead of exhausting one", () => {
    const list: PageCandidate[] = [...threeWayCandidates().slice(0, 3), ...industryCandidates().slice(0, 3)]
    const batch = pickBatch(list, [], none, () => true, 4)
    expect(batch.map(candidateFamily)).toEqual(["industry", "three-way", "industry", "three-way"])
    expect(new Set(batch.map(candidatePath)).size).toBe(4)
  })

  it("stops when nothing is left", () => {
    expect(pickBatch(threeWayCandidates().slice(0, 2), [], none, () => true, 5)).toHaveLength(2)
  })
})

describe("the stats bar", () => {
  it("shows product facts from the constants that enforce them", () => {
    expect(STAT_IDS.map(statValue)).toEqual([String(FREE_DOCUMENTS_PER_MONTH), "0", "3", "2"])
  })
})
