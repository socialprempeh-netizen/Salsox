/**
 * Coverage: a keyword the site already answers is never picked, a narrower
 * one is.
 */
import { describe, expect, it } from "vitest"
import { coveredBy, covers, keywordTokens, pickUntargeted } from "./dedupe"

describe("keywordTokens", () => {
  it("drops filler words and folds plurals", () => {
    expect([...keywordTokens("How to sign the PDFs")]).toEqual(["sign", "pdf"])
    expect([...keywordTokens("Electronic signatures for companies")]).toEqual(["electronic", "signature", "company"])
    expect([...keywordTokens("business process")]).toEqual(["business", "process"])
  })
})

describe("covers", () => {
  it("is true when every keyword word is in the phrase", () => {
    expect(covers("How to sign a PDF: every method, on any device", "sign pdf")).toBe(true)
    expect(covers("Are electronic signatures legal?", "electronic signature legal")).toBe(true)
  })

  it("is true for a near-identical phrase", () => {
    expect(covers("docusign pricing plans explained", "docusign pricing plan cost explained")).toBe(true)
  })

  it("is false for a narrower intent with a real extra word", () => {
    expect(covers("How to sign a PDF", "sign pdf on iphone")).toBe(false)
  })

  it("is false for nothing in common or empty text", () => {
    expect(covers("Pricing", "lease agreement template")).toBe(false)
    expect(covers("", "sign pdf")).toBe(false)
    expect(covers("Sign PDF", "the")).toBe(false)
  })
})

describe("pickUntargeted", () => {
  it("returns the best candidate nothing covers", () => {
    const ranked = [{ query: "sign pdf" }, { query: "rental agreement esignature" }, { query: "nda template" }]
    const phrases = ["How to sign a PDF", "nda template"]
    expect(pickUntargeted(ranked, phrases)).toEqual({ query: "rental agreement esignature" })
    expect(coveredBy("nda template", phrases)).toBe("nda template")
  })

  it("returns null when everything is covered", () => {
    expect(pickUntargeted([{ query: "sign pdf" }], ["Sign PDF free"])).toBeNull()
  })
})
