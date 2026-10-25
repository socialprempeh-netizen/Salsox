/**
 * Tests for the two-factor rules (two-factor-policy.ts): what counts as
 * enrolled, the admin gate's three outcomes, and when the payout suggestion
 * shows.
 */
import { describe, expect, it } from "vitest"
import { adminAccess, enrollmentShare, isTwoFactorEnrolled, showPayoutTwoFactorNudge } from "./two-factor-policy"

describe("isTwoFactorEnrolled", () => {
  it("needs the flag and a verified authenticator", () => {
    expect(isTwoFactorEnrolled({ twoFactorEnabled: true, twoFactor: [{ verified: true }] })).toBe(true)
  })

  it("does not count a setup abandoned halfway or a stray flag", () => {
    expect(isTwoFactorEnrolled({ twoFactorEnabled: false, twoFactor: [{ verified: false }] })).toBe(false)
    expect(isTwoFactorEnrolled({ twoFactorEnabled: true, twoFactor: [{ verified: false }] })).toBe(false)
    expect(isTwoFactorEnrolled({ twoFactorEnabled: true, twoFactor: [] })).toBe(false)
    expect(isTwoFactorEnrolled({ twoFactorEnabled: null, twoFactor: [{ verified: true }] })).toBe(false)
  })
})

describe("adminAccess", () => {
  it("lets an enrolled admin in only on a session that passed the code", () => {
    expect(adminAccess({ role: "ADMIN", enrolled: true, sessionVerified: true })).toBe("ok")
    expect(adminAccess({ role: "ADMIN", enrolled: true, sessionVerified: false })).toBe("verify")
  })

  it("sends an admin without 2FA to enroll first, whatever the session", () => {
    expect(adminAccess({ role: "ADMIN", enrolled: false, sessionVerified: false })).toBe("enroll")
    expect(adminAccess({ role: "ADMIN", enrolled: false, sessionVerified: true })).toBe("enroll")
  })

  it("never opens the admin area to anyone else", () => {
    expect(adminAccess({ role: "USER", enrolled: true, sessionVerified: true })).toBe("not-admin")
  })
})

describe("showPayoutTwoFactorNudge", () => {
  it("shows to someone who can be paid out and has no 2FA", () => {
    expect(showPayoutTwoFactorNudge({ enrolled: false, payoutAccounts: 1, dismissedAt: null })).toBe(true)
  })

  it("does not show without a payout account, once enrolled, or once dismissed", () => {
    expect(showPayoutTwoFactorNudge({ enrolled: false, payoutAccounts: 0, dismissedAt: null })).toBe(false)
    expect(showPayoutTwoFactorNudge({ enrolled: true, payoutAccounts: 2, dismissedAt: null })).toBe(false)
    expect(showPayoutTwoFactorNudge({ enrolled: false, payoutAccounts: 1, dismissedAt: new Date() })).toBe(false)
  })
})

describe("enrollmentShare", () => {
  it("is a whole percentage, or null for nobody", () => {
    expect(enrollmentShare(1, 3)).toBe(33)
    expect(enrollmentShare(2, 2)).toBe(100)
    expect(enrollmentShare(0, 0)).toBeNull()
  })
})
