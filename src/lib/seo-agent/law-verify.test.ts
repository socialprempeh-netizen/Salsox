import { describe, expect, it } from "vitest"
import { normalizeForMatch, unverifiedFacts, verifyLaw } from "./law-verify"
import type { ComplianceCandidate, LawFact } from "./page-queue"

const fact = (id: string, source: number, quote: string): LawFact => ({ id, cite: `section ${id}`, text: "A fact.", source, quote })

describe("normalizeForMatch", () => {
  it("ignores case, punctuation, quote and dash styles and spacing", () => {
    expect(normalizeForMatch("“Electronic  signature” — means:\n data, (in) electronic form")).toBe("electronic signature means data in electronic form")
    expect(normalizeForMatch("Die elektronische Form ist ausgeschlossen.")).toBe("die elektronische form ist ausgeschlossen")
  })
})

describe("unverifiedFacts", () => {
  const texts = new Map([
    [0, { ok: true, text: "(1) A record may not be denied legal effect, validity, or enforceability solely because it is in electronic form." }],
    [1, { ok: false, text: "", reason: "HTTP 403" }],
  ])

  it("passes a fact whose passage is in its source, however it is punctuated there", () => {
    expect(unverifiedFacts([fact("1", 0, "may not be denied legal effect validity or enforceability")], texts)).toEqual([])
  })

  it("fails a fact whose passage has gone, whose source cannot be read, or whose source is not listed", () => {
    const result = unverifiedFacts([fact("2", 0, "an electronic signature satisfies the law"), fact("3", 1, "anything"), fact("4", 7, "anything")], texts)
    expect(result.map((r) => r.reason)).toEqual(["its passage is no longer in the official text", "its source could not be read (HTTP 403)", "its source is not listed"])
  })
})

describe("verifyLaw", () => {
  const candidate: ComplianceCandidate = {
    kind: "compliance",
    slug: "x",
    keyword: "x",
    country: "X",
    verified: "2026-10-22",
    sources: [{ label: "Statute", url: "https://example.org/statute" }, { label: "Other", url: "https://example.org/other" }],
    facts: [fact("1", 0, "shall have the equivalent legal effect of a handwritten signature")],
    statutes: [],
    angle: "",
  }

  it("reads only the sources the facts use, and verifies against them", async () => {
    const read: string[] = []
    const problems = await verifyLaw(candidate, async (s) => {
      read.push(s.url)
      return { ok: true, text: "2. A qualified electronic signature shall have the equivalent legal effect of a handwritten signature." }
    })
    expect(problems).toEqual([])
    expect(read).toEqual(["https://example.org/statute"])
  })

  it("names each unverified provision and its source", async () => {
    const problems = await verifyLaw(candidate, async () => ({ ok: true, text: "This text was amended." }))
    expect(problems).toEqual(["section 1 (https://example.org/statute): its passage is no longer in the official text"])
  })
})
