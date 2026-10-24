import { describe, expect, it } from "vitest"
import { addMonthsUtc, canonicalEmail, extendReferralPro, generateReferralCode, mayRefer, normalizeReferralCode, referralLink, referralStatus } from "./referrals"

const at = (iso: string) => new Date(iso)

describe("invite codes", () => {
  it("are eight characters from an alphabet without look-alikes", () => {
    const code = generateReferralCode()
    expect(code).toMatch(/^[2-9a-hjkmnp-z]{8}$/)
    expect(generateReferralCode(() => new Uint8Array(8))).toBe("22222222")
  })

  it("are read case-insensitively, and anything else is not a code", () => {
    expect(normalizeReferralCode("  AbC23456 ")).toBe("abc23456")
    expect(normalizeReferralCode("ab")).toBeNull()
    expect(normalizeReferralCode("abc-2345")).toBeNull()
    expect(normalizeReferralCode(undefined)).toBeNull()
  })

  it("make a link on the site's own address", () => {
    expect(referralLink("abc23456", "https://example.com/")).toBe("https://example.com/invite/abc23456")
  })
})

describe("free Pro months", () => {
  it("adds calendar months, clamped to the end of a short month", () => {
    expect(addMonthsUtc(at("2026-11-30T10:00:00Z"), 3).toISOString()).toBe("2027-02-28T10:00:00.000Z")
    expect(addMonthsUtc(at("2026-01-15T00:00:00Z"), 12).toISOString()).toBe("2027-01-15T00:00:00.000Z")
  })

  it("start from today, or stack after free time still running", () => {
    const now = at("2026-10-24T00:00:00Z")
    expect(extendReferralPro(null, now).toISOString()).toBe("2027-01-24T00:00:00.000Z")
    expect(extendReferralPro(at("2026-01-01T00:00:00Z"), now).toISOString()).toBe("2027-01-24T00:00:00.000Z")
    expect(extendReferralPro(at("2027-01-24T00:00:00Z"), now).toISOString()).toBe("2027-04-24T00:00:00.000Z")
  })

  it("never reach more than two years ahead", () => {
    const now = at("2026-10-24T00:00:00Z")
    expect(extendReferralPro(at("2028-09-01T00:00:00Z"), now).toISOString()).toBe("2028-10-24T00:00:00.000Z")
  })
})

describe("who may refer whom", () => {
  it("treats +tags, Gmail dots and case as the same mailbox", () => {
    expect(canonicalEmail("Jane.Doe+promo@GoogleMail.com")).toBe("janedoe@gmail.com")
    expect(canonicalEmail("jane.doe+x@example.com")).toBe("jane.doe@example.com")
  })

  it("refuses inviting yourself, by account or by mailbox", () => {
    const jane = { id: "u1", email: "jane@example.com" }
    expect(mayRefer(jane, jane)).toBe(false)
    expect(mayRefer(jane, { id: "u2", email: "Jane+2@example.com" })).toBe(false)
    expect(mayRefer(jane, { id: "u3", email: "sam@example.com" })).toBe(true)
  })

  it("calls an invited person active once their reward is granted", () => {
    expect(referralStatus({ rewarded: false })).toBe("joined")
    expect(referralStatus({ rewarded: true })).toBe("active")
  })
})
