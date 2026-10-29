/**
 * The page matrix's pages as drafts and prompts: a three-way comparison, an
 * industry page with its stats bar and use-case blocks, and a market page
 * dated by its verified law, each stored and parsed back as the site will
 * render it; and the prompts that ask for the matrix's rows and FAQs.
 */
import { describe, expect, it } from "vitest"
import { getPages } from "@/lib/seo/pages"
import { citationProblems, registryData, toSitePage, type PageDraft, type UseCaseDraft } from "./page-draft"
import { DIFFERENTIATOR_ROWS, industryCandidates, industryComparisonCandidates, marketCandidates, roleCandidates, threeWayCandidates } from "./page-matrix"
import { comparisonUserPrompt, industrySystemPrompt, industryUserPrompt } from "./page-prompt"
import { UNITED_STATES } from "./page-queue"

const today = "2026-10-29"
const signwell = getPages({ kind: "comparison" }).find((p) => p.slug === "signwell")!
const base: PageDraft = {
  title: "{site} vs DocuSign vs PandaDoc compared",
  description: "{site}, DocuSign and PandaDoc side by side: free plans, entry prices, payment at signing and phone-first signing, from each company's own pages.",
  h1: "{site} vs DocuSign vs PandaDoc",
  lede: "Choosing between DocuSign and PandaDoc usually comes down to proposals against plain signing; this page sets both against their own pricing pages, and shows where a third option fits.",
  breadcrumb: "DocuSign vs PandaDoc",
  aliases: ["pandadoc vs docusign"],
  benefits: [{ title: "Payments", body: "Sign & Pay on Business." }],
  faq: signwell.faq,
  related: ["/vs/docusign", "/vs/pandadoc", "/pricing"],
  body: signwell.body,
}

describe("matrix drafts", () => {
  it("stores a three-way comparison with its second company as a rival", () => {
    const c = threeWayCandidates()[0]
    const stored = registryData(c, base, { today, sources: [...c.sources, ...c.rival!.sources] })
    expect(stored.data).toMatchObject({ competitor: { name: "DocuSign" }, rivals: [{ name: "PandaDoc", url: "https://www.pandadoc.com" }], checked: today })
    const parsed = toSitePage("comparison", c.slug, stored)
    expect("page" in parsed && parsed.page.path).toBe("/vs/docusign-vs-pandadoc")
  })

  it("stores an industry page with the stats bar, its use-case blocks and no check date", () => {
    const c = industryCandidates().find((x) => x.slug === "insurance")!
    const draft: UseCaseDraft = { ...base, useCases: c.documents.map((d) => ({ title: d, body: "Signed on a phone with an audit trail." })) }
    const stored = registryData(c, draft, { today, sources: [] })
    expect(stored.data).toMatchObject({ stats: ["freeDocuments", "signerAccounts", "sendChannels", "payAtSigning"], primaryKeyword: "esignature for insurance agencies" })
    expect(stored.data.checked).toBeUndefined()
    expect((stored.data.useCases as unknown[]).length).toBe(c.documents.length)
    const parsed = toSitePage("use-case", c.slug, stored)
    expect("page" in parsed && parsed.page.path).toBe("/esignature-for/insurance")
  })

  it("dates a market page by the day its law was verified", () => {
    const c = marketCandidates().find((x) => x.slug === "real-estate-us")!
    const stored = registryData(c, { ...base, useCases: [] }, { today, sources: c.market!.law.sources })
    expect(stored.data.checked).toBe(UNITED_STATES.verified)
  })

  it("asks a market page for fewer citations than a law page", () => {
    const text = "Under 15 U.S.C. § 7001(a) and § 7003, a lease may be signed electronically. This is general information, not legal advice."
    expect(citationProblems(text, UNITED_STATES, 2).filter((p) => /needs at least/.test(p))).toEqual([])
    expect(citationProblems(text, UNITED_STATES).some((p) => /needs at least 5/.test(p))).toBe(true)
  })
})

describe("matrix prompts", () => {
  const input = { productSummary: "SUMMARY", sources: [], paths: [{ path: "/pricing", name: "Pricing", description: "Plans" }], siblingIntros: [], reference: null, today }

  it("asks a three-way comparison for three columns, the differentiator rows and the switching FAQs", () => {
    const p = comparisonUserPrompt({ ...input, candidate: threeWayCandidates()[0] })
    expect(p).toContain(`"{site} vs DocuSign vs PandaDoc"`)
    expect(p).toContain("three product columns")
    for (const row of DIFFERENTIATOR_ROWS) expect(p).toContain(row)
    expect(p).toMatch(/legally enforceable/)
    expect(p).toMatch(/free plan allows/)
    expect(p).toMatch(/how to move from DocuSign and PandaDoc/)
  })

  it("reads an industry comparison through the industry's documents and links to its page", () => {
    const p = comparisonUserPrompt({ ...input, candidate: industryComparisonCandidates()[0] })
    expect(p).toContain("for real estate")
    expect(p).toContain("tenancy and lease agreements")
    expect(p).toContain("/esignature-for/real-estate")
  })

  it("writes role pages under their parent and market pages from verified law only", () => {
    const role = industryUserPrompt({ ...input, candidate: roleCandidates()[0] })
    expect(role).toContain("Its parent page is /esignature-for/real-estate")
    const market = industryUserPrompt({ ...input, candidate: marketCandidates().find((c) => c.slug === "real-estate-uk")! })
    expect(market).toContain(`<verified_facts country="United Kingdom"`)
    expect(market).toMatch(/not legal advice/)
    expect(industrySystemPrompt()).toMatch(/useCases: one block per document/)
  })
})
