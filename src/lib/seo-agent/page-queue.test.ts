import { describe, expect, it } from "vitest"
import { getAllPosts } from "@/lib/blog"
import { getPages, pagePath } from "@/lib/seo/pages"
import { getTemplates, roleSchema } from "@/lib/templates"
import { INDUSTRY_IDS, TEAM_IDS, TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from "@/lib/templates-taxonomy"
import { covers } from "./dedupe"
import {
  ALL_CANDIDATES,
  candidatePath,
  candidateSubject,
  COMPETITOR_CANDIDATES,
  COMPLIANCE_CANDIDATES,
  GERMANY,
  MAX_PAGE_ATTEMPTS,
  OFF_MARKET_PATHS,
  pickCandidate,
  TEMPLATE_CANDIDATES,
  UNITED_STATES,
  type PageCandidate,
} from "./page-queue"

describe("the candidate queue", () => {
  it("has one candidate per path, none of them a page the site already has", () => {
    const paths = ALL_CANDIDATES.map(candidatePath)
    expect(new Set(paths).size).toBe(paths.length)
    const existing = new Set([...getTemplates().map((t) => t.path), ...getPages().map((p) => p.path)])
    expect(paths.filter((p) => existing.has(p))).toEqual([])
  })

  it("puts each kind where its route serves it", () => {
    for (const c of COMPLIANCE_CANDIDATES) expect(candidatePath(c)).toBe(pagePath("compliance", c.slug))
    for (const c of COMPETITOR_CANDIDATES) expect(candidatePath(c)).toBe(pagePath(c.kind, c.slug))
  })

  it("tags templates only with taxonomy ids and valid roles, one of them the sender", () => {
    for (const c of TEMPLATE_CANDIDATES) {
      expect(TEMPLATE_CATEGORIES).toContain(c.category)
      expect(TEMPLATE_TYPES).toContain(c.type)
      for (const i of c.industries) expect(INDUSTRY_IDS).toContain(i)
      for (const t of c.teams) expect(TEAM_IDS).toContain(t)
      for (const r of c.roles) expect(roleSchema.safeParse(r).success).toBe(true)
      expect(c.roles.filter((r) => r.you)).toHaveLength(1)
      expect(c.angle.length).toBeGreaterThan(80)
    }
  })

  it("gives every comparison an https source and every round-up at least two", () => {
    for (const c of COMPETITOR_CANDIDATES) {
      expect(c.sources.length).toBeGreaterThanOrEqual(c.kind === "alternative" ? 2 : 1)
      for (const s of c.sources) expect(s.url).toMatch(/^https:\/\//)
    }
  })

  it("has one law page per target market, and none for Ghana", () => {
    expect(COMPLIANCE_CANDIDATES.map((c) => c.slug)).toEqual(["united-states", "united-kingdom", "canada", "germany"])
    expect(ALL_CANDIDATES.some((c) => /ghana/i.test(`${c.slug} ${c.keyword}`))).toBe(false)
  })

  it("ties every law fact to an official https source with a passage to verify", () => {
    for (const c of COMPLIANCE_CANDIDATES) {
      for (const f of c.facts) {
        expect(c.sources[f.source], `${c.slug}/${f.id}`).toBeDefined()
        expect(c.sources[f.source].url).toMatch(/^https:\/\//)
        expect(f.quote.trim().length, `${c.slug}/${f.id} quote`).toBeGreaterThan(8)
      }
      expect(new Set(c.facts.map((f) => f.id)).size).toBe(c.facts.length)
      expect(c.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.statutes.length).toBeGreaterThan(0)
      // Every source is used by at least one fact, so none is listed unread.
      expect(new Set(c.facts.map((f) => f.source)).size, c.slug).toBe(c.sources.length)
    }
  })

  it("is not already covered by the blog, and keeps off-market guides real", () => {
    const titles = getAllPosts().flatMap((p) => [p.title, ...(p.keyword ? [p.keyword] : [])])
    for (const c of COMPLIANCE_CANDIDATES) expect(titles.filter((t) => covers(t, c.keyword)), c.slug).toEqual([])
    for (const path of OFF_MARKET_PATHS) expect(getAllPosts().some((p) => `/blog/${p.slug}` === path), path).toBe(true)
  })

  it("names what each page is about, for the intro check", () => {
    expect(candidateSubject(GERMANY)).toEqual(["Germany"])
    expect(candidateSubject(COMPETITOR_CANDIDATES[0])[0]).toBe(COMPETITOR_CANDIDATES[0].competitor.name)
    // Was "loan agreement", the first candidate until it was written by hand.
    expect(candidateSubject(TEMPLATE_CANDIDATES[0])[0]).toBe("property management agreement")
  })
})

describe("pickCandidate", () => {
  const law = UNITED_STATES
  const tpl = TEMPLATE_CANDIDATES[0]
  const cmp = COMPETITOR_CANDIDATES[0]
  const list: PageCandidate[] = [tpl, cmp, law]
  const none = () => false

  it("writes a law page first", () => {
    expect(pickCandidate(list, [], none)).toBe(law)
  })

  it("then alternates templates and competitor pages by how many of each exist", () => {
    const lawDone = [{ kind: "compliance" as const, slug: "united-states", status: "PUBLISHED", attempts: 1 }]
    expect(pickCandidate(list, lawDone, none)).toBe(tpl)
    const oneTemplate = [...lawDone, { kind: "template" as const, slug: "other", status: "DRAFT", attempts: 1 }]
    expect(pickCandidate(list, oneTemplate, none)).toBe(cmp)
  })

  it("retries a failure once, then sets it aside", () => {
    const failedOnce = [{ kind: "compliance" as const, slug: "united-states", status: "FAILED", attempts: 1 }]
    expect(pickCandidate(list, failedOnce, none)).toBe(law)
    const failedTwice = [{ kind: "compliance" as const, slug: "united-states", status: "FAILED", attempts: MAX_PAGE_ATTEMPTS }]
    expect(pickCandidate(list, failedTwice, none)).toBe(tpl)
  })

  it("skips what the site already covers, and returns null when nothing is left", () => {
    expect(pickCandidate(list, [], (c) => c.kind === "compliance")).toBe(tpl)
    expect(pickCandidate(list, [], () => true)).toBeNull()
  })
})
