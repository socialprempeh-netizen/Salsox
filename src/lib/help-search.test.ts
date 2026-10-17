/**
 * Tests for the Help Center search matching (help-search.ts): every word must
 * appear, in any order, partial words count, case and accents are ignored,
 * and an empty query matches nothing.
 */
import { describe, expect, it } from "vitest"
import { matchesQuery } from "./help-search"

const guide = ["Connect Stripe or Paystack to get paid", "Set up where Sign & Pay money goes.", "Sign & Pay"]

describe("matchesQuery", () => {
  it("needs every word, in any order, and accepts partial words", () => {
    expect(matchesQuery("pay connect", guide)).toBe(true)
    expect(matchesQuery("payst", guide)).toBe(true)
    expect(matchesQuery("connect invoice", guide)).toBe(false)
  })

  it("ignores case, accents and extra spaces", () => {
    expect(matchesQuery("  STRIPE   ", guide)).toBe(true)
    expect(matchesQuery("pàid", guide)).toBe(true)
  })

  it("matches nothing for an empty query", () => {
    expect(matchesQuery("", guide)).toBe(false)
    expect(matchesQuery("   ", guide)).toBe(false)
  })
})
