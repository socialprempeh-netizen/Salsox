/**
 * Tests for the sign-in policy rules (security-policy.ts): what a change may
 * do, which method is locked, who may enroll in what, and who is held at the
 * setup screen when 2FA is enforced.
 */
import { describe, expect, it } from "vitest"
import { applySecurityPatch, canEnroll, DEFAULT_SECURITY_POLICY as D, lockedMethod, mustEnrollNow, securityPatchSchema } from "./security-policy"

describe("applySecurityPatch", () => {
  it("applies an allowed change", () => {
    expect(applySecurityPatch(D, { enforceTwoFactor: true })).toEqual({ ok: true, policy: { ...D, enforceTwoFactor: true } })
    expect(applySecurityPatch(D, { sessionTimeoutMinutes: 30 })).toEqual({ ok: true, policy: { ...D, sessionTimeoutMinutes: 30 } })
  })

  it("keeps at least one method on", () => {
    const totpOnly = { ...D, passkeyEnabled: false }
    expect(applySecurityPatch(totpOnly, { totpEnabled: false })).toEqual({ ok: false, error: "last-method" })
  })

  it("will not enforce 2FA that is turned off, and turning it off stops enforcing", () => {
    expect(applySecurityPatch({ ...D, twoFactorEnabled: false }, { enforceTwoFactor: true })).toEqual({ ok: false, error: "enforce-needs-2fa" })
    const off = applySecurityPatch({ ...D, enforceTwoFactor: true }, { twoFactorEnabled: false })
    expect(off.ok && off.policy.enforceTwoFactor).toBe(false)
  })

  it("only takes the listed inactivity limits", () => {
    expect(applySecurityPatch(D, { sessionTimeoutMinutes: 7 })).toEqual({ ok: false, error: "timeout" })
    expect(applySecurityPatch({ ...D, sessionTimeoutMinutes: 60 }, { sessionTimeoutMinutes: null }).ok).toBe(true)
  })

  it("parses only known fields", () => {
    expect(securityPatchSchema.safeParse({ enforceTwoFactor: true }).success).toBe(true)
    expect(securityPatchSchema.safeParse({ role: "ADMIN" }).success).toBe(false)
    expect(securityPatchSchema.safeParse({ totpEnabled: "yes" }).success).toBe(false)
  })
})

describe("lockedMethod", () => {
  it("locks the last method on", () => {
    expect(lockedMethod(D)).toBeNull()
    expect(lockedMethod({ ...D, passkeyEnabled: false })).toBe("totp")
    expect(lockedMethod({ ...D, totpEnabled: false })).toBe("passkey")
  })
})

describe("canEnroll", () => {
  it("follows the method switches for everyone", () => {
    expect(canEnroll({ ...D, passkeyEnabled: false }, "passkey", "ADMIN")).toBe(false)
    expect(canEnroll(D, "totp", "USER")).toBe(true)
  })

  it("lets admins enroll even with 2FA off for users", () => {
    const off = { ...D, twoFactorEnabled: false }
    expect(canEnroll(off, "totp", "USER")).toBe(false)
    expect(canEnroll(off, "totp", "ADMIN")).toBe(true)
  })
})

describe("mustEnrollNow", () => {
  const enforced = { ...D, enforceTwoFactor: true }

  it("holds an unenrolled user when enforced", () => {
    expect(mustEnrollNow({ policy: enforced, role: "USER", enrolled: false, hasPassword: true })).toBe(true)
  })

  it("leaves alone the enrolled, admins, and everyone when not enforced", () => {
    expect(mustEnrollNow({ policy: enforced, role: "USER", enrolled: true, hasPassword: true })).toBe(false)
    expect(mustEnrollNow({ policy: enforced, role: "ADMIN", enrolled: false, hasPassword: true })).toBe(false)
    expect(mustEnrollNow({ policy: D, role: "USER", enrolled: false, hasPassword: true })).toBe(false)
  })

  it("never holds someone at a screen they cannot get past", () => {
    const totpOnly = { ...enforced, passkeyEnabled: false }
    expect(mustEnrollNow({ policy: totpOnly, role: "USER", enrolled: false, hasPassword: false })).toBe(false)
    expect(mustEnrollNow({ policy: enforced, role: "USER", enrolled: false, hasPassword: false })).toBe(true)
  })
})
