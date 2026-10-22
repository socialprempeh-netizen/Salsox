import { describe, expect, it } from "vitest"
import { complianceSystemPrompt, complianceUserPrompt, comparisonSystemPrompt, comparisonUserPrompt, templateSystemPrompt, templateUserPrompt } from "./page-prompt"
import { COMPETITOR_CANDIDATES, COMPLIANCE_CANDIDATES, OWN_PLAN_FACTS, TEMPLATE_CANDIDATES } from "./page-queue"

const paths = [{ path: "/pricing", name: "Pricing", description: "Plans." }]

describe("page prompts", () => {
  it("are stable system prompts that forbid invented facts and lookalike intros", () => {
    for (const system of [templateSystemPrompt(), comparisonSystemPrompt(), complianceSystemPrompt()]) {
      expect(system).toMatch(/Never invent/)
      expect(system).toMatch(/names masked/)
    }
    expect(complianceSystemPrompt()).toMatch(/not legal advice/)
    expect(complianceSystemPrompt()).toMatch(/never name any other law/)
    expect(complianceSystemPrompt()).not.toMatch(/Act 772|Ghana/)
    expect(comparisonSystemPrompt()).toMatch(/not listed on that page/)
  })

  it("give a template its roles, its angle and its neighbours' intros", () => {
    const c = TEMPLATE_CANDIDATES[0]
    const user = templateUserPrompt({ candidate: c, productSummary: "Product.", reference: null, siblingIntros: ["A neighbour's lede."], feedback: ["intro: too short"] })
    for (const r of c.roles) expect(user).toContain(`- ${r.id}: ${r.label}`)
    expect(user).toContain(c.angle)
    expect(user).toContain("A neighbour's lede.")
    expect(user).toContain("- intro: too short")
  })

  it("give a comparison the fetched source text, the plan facts and the paths it may link to", () => {
    const c = COMPETITOR_CANDIDATES[0]
    const user = comparisonUserPrompt({ candidate: c, productSummary: "Product.", sources: [{ label: "Pricing", url: c.sources[0].url, text: "Plan A costs $5.", ok: true }], paths, siblingIntros: [], reference: null, today: "2026-10-22" })
    expect(user).toContain("Plan A costs $5.")
    for (const fact of OWN_PLAN_FACTS) expect(user).toContain(fact)
    expect(user).toContain("- /pricing: Pricing. Plans.")
    expect(user).toContain("fetched on 2026-10-22")
  })

  it("give each law page every verified fact with its citation", () => {
    for (const c of COMPLIANCE_CANDIDATES) {
      const user = complianceUserPrompt({ candidate: c, productSummary: "Product.", paths, siblingIntros: [] })
      for (const f of c.facts) expect(user).toContain(`cite="${f.cite}"`)
      expect(user).toContain(`checked="${c.verified}"`)
      expect(user).toContain(`Write the e-signature law page for ${c.country}.`)
    }
  })
})
