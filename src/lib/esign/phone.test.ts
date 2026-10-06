/**
 * Tests for phone number normalisation (phone.ts): international numbers are
 * accepted however they are typed, and a local number is never given a
 * country by guesswork.
 */
import { describe, expect, it } from "vitest"
import { toE164 } from "./phone"

describe("toE164", () => {
  it("accepts international numbers however they are typed", () => {
    expect(toE164("+233 20 123 4567")).toBe("+233201234567")
    expect(toE164("00233-20-123-4567")).toBe("+233201234567")
    expect(toE164("+1 (415) 555.0100")).toBe("+14155550100")
  })

  it("never guesses a country for a local number", () => {
    expect(toE164("020 123 4567")).toBeNull()
    expect(toE164("2012345")).toBeNull()
    expect(toE164("+0123456789")).toBeNull()
    expect(toE164("")).toBeNull()
  })
})
