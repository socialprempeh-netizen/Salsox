import { describe, expect, it } from "vitest"
import { getPages } from "@/lib/seo/pages"
import { getTemplates } from "@/lib/templates"
import { citationProblems, introOf, provisionRefs, unknownStatutes, registryData, registryProblems, storedPath, templateData, templateProblems, toSitePage, toTemplate, type PageDraft, type TemplateDraft } from "./page-draft"
import { CANADA, GERMANY, TEMPLATE_CANDIDATES, UNITED_STATES, type CompetitorCandidate } from "./page-queue"

const today = "2026-10-22"

/** A real template's content, re-presented as a draft for a new candidate: valid by construction. */
function templateDraftFrom(slug: string, rename: string): TemplateDraft {
  const t = getTemplates().find((x) => x.slug === slug)!
  return {
    title: `${rename} Template (Free PDF Download)`,
    description: `A free ${rename.toLowerCase()} template with the clauses that matter, ready to fill in and send for e-signature on any phone.`,
    h1: `${rename} template`,
    lede: `A ${rename.toLowerCase()} for two people who know each other, with the amount, the repayment dates and what happens if a payment is missed.`,
    variables: Object.entries(t.variables).map(([name, sample]) => ({ name, sample })),
    about: t.about,
    faq: t.faq,
    body: t.body,
  }
}

describe("generated templates", () => {
  const candidate = { ...TEMPLATE_CANDIDATES.find((c) => c.slug === "loan-agreement")!, roles: getTemplates().find((x) => x.slug === "mutual-nda")!.roles }

  it("become library Templates and pass the library's own rules", () => {
    const stored = templateData(candidate, templateDraftFrom("mutual-nda", "Loan Agreement"), today)
    const built = toTemplate("loan-agreement", stored)
    expect("template" in built && built.template.path).toBe("/templates/loan-agreement")
    expect(templateProblems("loan-agreement", stored, getTemplates())).toEqual([])
  })

  it("fail on a title an existing template already has, or a blank without a sample", () => {
    const draft = templateDraftFrom("mutual-nda", "Loan Agreement")
    const taken = getTemplates().find((x) => x.slug === "mutual-nda")!.title
    const dup = templateData(candidate, { ...draft, title: taken }, today)
    expect(templateProblems("loan-agreement", dup, getTemplates()).join(" ")).toMatch(/same title as \/templates\/mutual-nda/)
    const missing = templateData(candidate, { ...draft, variables: draft.variables.slice(1) }, today)
    expect(templateProblems("loan-agreement", missing, getTemplates()).join(" ")).toMatch(/has no sample in variables/)
  })
})

describe("generated comparison pages", () => {
  const signwell = getPages({ kind: "comparison" }).find((p) => p.slug === "signwell")!
  const candidate: CompetitorCandidate = { kind: "comparison", slug: "boldsign", keyword: "boldsign", competitor: { name: "BoldSign", url: "https://boldsign.com" }, sources: [{ label: "BoldSign pricing", url: "https://boldsign.com/electronic-signature-pricing/" }], angle: "" }
  const draft: PageDraft = {
    title: "{site} vs BoldSign: API, plans and payments compared",
    description: "{site} vs BoldSign: free plans, paid prices, API pricing and payment collection, checked against BoldSign's own pricing page today.",
    h1: "{site} vs BoldSign",
    lede: "BoldSign prices its API per document and suits teams that send from their own software; this page is for deciding whether that matters more than collecting payment as clients sign.",
    breadcrumb: "vs BoldSign",
    aliases: ["boldsign comparison"],
    benefits: [{ title: "Payments", body: "Sign & Pay on Business." }],
    faq: signwell.faq,
    related: ["/vs/signwell", "/vs/docuseal", "/pricing"],
    body: signwell.body,
  }
  const known = new Set(["/vs/signwell", "/vs/docuseal", "/pricing"])

  it("become registry pages that pass the registry's rules, similarity aside", () => {
    const stored = registryData(candidate, draft, { today, sources: candidate.sources })
    expect(stored.data).toMatchObject({ checked: today, competitor: candidate.competitor, primaryKeyword: "boldsign" })
    const built = toSitePage("comparison", "boldsign", stored)
    expect("page" in built && built.page.path).toBe("/vs/boldsign")
    // The body is SignWell's, word for word: the registry would call that 100%
    // alike, but that verdict belongs to the duplicate gate, not this check.
    expect(registryProblems("comparison", "boldsign", stored, getPages(), known)).toEqual([])
  })

  it("fail on a related link to nowhere and a keyword another page owns", () => {
    const stored = registryData({ ...candidate, keyword: "signwell" }, { ...draft, related: ["/vs/signwell", "/pricing", "/nowhere"] }, { today, sources: candidate.sources })
    const problems = registryProblems("comparison", "boldsign", stored, getPages(), known).join(" | ")
    expect(problems).toMatch(/related link \/nowhere goes nowhere/)
    expect(problems).toMatch(/already belongs to \/vs\/signwell|intent "signwell"/)
  })

  it("are found at their kind's path", () => {
    expect(storedPath("COMPARISON", "boldsign")).toBe("/vs/boldsign")
    expect(storedPath("ALTERNATIVE", "signnow")).toBe("/alternatives/signnow")
    expect(storedPath("COMPLIANCE", "ghana")).toBe("/esignature-law/ghana")
    expect(storedPath("TEMPLATE", "loan-agreement")).toBe("/templates/loan-agreement")
  })
})

describe("provisionRefs", () => {
  it("reads sections, subsections, articles and paragraph signs, lists included", () => {
    expect(provisionRefs("15 U.S.C. § 7001(c)(1) and subsection 48(1); sections 23 and 24; s. 7A; §§ 780 and 781 BGB; Article 25(2); Art. 3(10)")).toEqual(["7001", "48", "23", "24", "7a", "780", "781", "25", "3"])
  })

  it("does not read 'subsection' inside another word, or numbers with no provision word", () => {
    expect(provisionRefs("In 2000 the Act came in; 3 documents a month.")).toEqual([])
  })
})

describe("unknownStatutes", () => {
  it("accepts the candidate's statutes, short names and back-references", () => {
    const text = "Under the ESIGN Act and each state's Uniform Electronic Transactions Act, the Act applies. Ontario's Electronic Commerce Act, 2000 and the Ontario Act agree."
    expect(unknownStatutes(text, [...UNITED_STATES.statutes, ...CANADA.statutes])).toEqual([])
  })

  it("catches a statute nobody verified, even one sharing words with a real one", () => {
    expect(unknownStatutes("The Privacy Act and the Data Protection Act also apply.", CANADA.statutes)).toEqual(["the privacy Act", "the data protection Act"])
  })
})

describe("citationProblems (law pages)", () => {
  const good = `*General information, not legal advice.*\n\nUnder 15 U.S.C. § 7001(a) of the ESIGN Act, a contract is not denied effect because it is electronic, and § 7001(c) adds consumer consent. 15 U.S.C. § 7006(5) defines an electronic signature. UETA section 7 and section 9 of the Uniform Electronic Transactions Act cover recognition and attribution, and section 13 evidence.`

  it("passes a page that cites only verified statutes and provisions", () => {
    expect(citationProblems(good, UNITED_STATES)).toEqual([])
  })

  it("catches an invented section, an unverified statute and a missing disclaimer", () => {
    const bad = `${good} Section 99 says more, and the Privacy Act applies.`.replace("not legal advice", "")
    const problems = citationProblems(bad, UNITED_STATES).join(" | ")
    expect(problems).toMatch(/names statutes it was not given: .*privacy Act/)
    expect(problems).toMatch(/provisions that are not in its verified facts: 99/)
    expect(problems).toMatch(/not legal advice/)
  })

  it("holds a German page to its BGB and eIDAS provisions", () => {
    const de = "*Not legal advice.* Article 25(1) and Article 26 of the eIDAS Regulation, § 126a BGB, § 623 BGB and § 2 VDG apply; § 125 BGB does not appear in the facts."
    expect(citationProblems(de, GERMANY).join(" ")).toMatch(/not in its verified facts: 125/)
  })

  it("needs at least five provisions cited", () => {
    expect(citationProblems("Section 10 applies. Not legal advice.", UNITED_STATES).join(" ")).toMatch(/needs at least 5/)
  })
})

describe("introOf", () => {
  it("is the lede plus the first prose paragraph, skipping headings, tables and the disclaimer", () => {
    expect(introOf({ lede: "Lede.", body: "*This is general information.*\n\n## Heading\n\n| a | b |\n\nFirst paragraph." })).toBe("Lede. First paragraph.")
    expect(introOf({ lede: "Lede.", about: "About first.\n\nSecond." })).toBe("Lede. About first.")
  })
})
