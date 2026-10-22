import { describe, expect, it } from "vitest"
import { getPages, pagePath } from "@/lib/seo/pages"
import { getTemplates, roleSchema } from "@/lib/templates"
import { INDUSTRY_IDS, TEAM_IDS, TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from "@/lib/templates-taxonomy"
import { ALL_CANDIDATES, candidatePath, candidateSubject, COMPETITOR_CANDIDATES, GHANA, MAX_PAGE_ATTEMPTS, pickCandidate, TEMPLATE_CANDIDATES, type PageCandidate } from "./page-queue"

describe("the candidate queue", () => {
  it("has one candidate per path, none of them a page the site already has", () => {
    const paths = ALL_CANDIDATES.map(candidatePath)
    expect(new Set(paths).size).toBe(paths.length)
    const existing = new Set([...getTemplates().map((t) => t.path), ...getPages().map((p) => p.path)])
    expect(paths.filter((p) => existing.has(p))).toEqual([])
  })

  it("puts each kind where its route serves it", () => {
    expect(candidatePath(GHANA)).toBe(pagePath("compliance", "ghana"))
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

  it("ties every Ghana fact to a listed source and cites only the statutes it allows", () => {
    for (const f of GHANA.facts) {
      expect(GHANA.sources[f.source], f.id).toBeDefined()
      for (const m of `${f.cite} ${f.text}`.matchAll(/\bAct\s+(\d+)\b/g)) expect(GHANA.acts).toContain(`Act ${m[1]}`)
    }
    expect(new Set(GHANA.facts.map((f) => f.id)).size).toBe(GHANA.facts.length)
    expect(GHANA.verified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("names what each page is about, for the intro check", () => {
    expect(candidateSubject(GHANA)).toEqual(["Ghana"])
    expect(candidateSubject(COMPETITOR_CANDIDATES[0])[0]).toBe(COMPETITOR_CANDIDATES[0].competitor.name)
    expect(candidateSubject(TEMPLATE_CANDIDATES[0])[0]).toBe("loan agreement")
  })
})

describe("pickCandidate", () => {
  const law = GHANA
  const tpl = TEMPLATE_CANDIDATES[0]
  const cmp = COMPETITOR_CANDIDATES[0]
  const list: PageCandidate[] = [tpl, cmp, law]
  const none = () => false

  it("writes a law page first", () => {
    expect(pickCandidate(list, [], none)).toBe(law)
  })

  it("then alternates templates and competitor pages by how many of each exist", () => {
    const lawDone = [{ kind: "compliance" as const, slug: "ghana", status: "PUBLISHED", attempts: 1 }]
    expect(pickCandidate(list, lawDone, none)).toBe(tpl)
    const oneTemplate = [...lawDone, { kind: "template" as const, slug: "other", status: "DRAFT", attempts: 1 }]
    expect(pickCandidate(list, oneTemplate, none)).toBe(cmp)
  })

  it("retries a failure once, then sets it aside", () => {
    const failedOnce = [{ kind: "compliance" as const, slug: "ghana", status: "FAILED", attempts: 1 }]
    expect(pickCandidate(list, failedOnce, none)).toBe(law)
    const failedTwice = [{ kind: "compliance" as const, slug: "ghana", status: "FAILED", attempts: MAX_PAGE_ATTEMPTS }]
    expect(pickCandidate(list, failedTwice, none)).toBe(tpl)
  })

  it("skips what the site already covers, and returns null when nothing is left", () => {
    expect(pickCandidate(list, [], (c) => c.kind === "compliance")).toBe(tpl)
    expect(pickCandidate(list, [], () => true)).toBeNull()
  })
})
