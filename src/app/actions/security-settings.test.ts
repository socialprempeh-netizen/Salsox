/**
 * Tests for updateSecuritySettings (security-settings.ts): only a fully
 * verified admin can change the policy, the change is re-parsed, and the
 * policy's own rules hold whatever the page sent.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SECURITY_POLICY } from "@/lib/security-policy"

const getAdminUser = vi.fn()
const getSecurityPolicy = vi.fn()
const saveSecurityPolicy = vi.fn()
const countPasskeyOnlyAdmins = vi.fn()

vi.mock("@/lib/auth", () => ({ getAdminUser: () => getAdminUser() }))
vi.mock("@/lib/security-settings", () => ({
  getSecurityPolicy: () => getSecurityPolicy(),
  saveSecurityPolicy: (...a: unknown[]) => saveSecurityPolicy(...a),
  countPasskeyOnlyAdmins: () => countPasskeyOnlyAdmins(),
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

const { updateSecuritySettings } = await import("./security-settings")

beforeEach(() => {
  vi.resetAllMocks()
  getAdminUser.mockResolvedValue({ id: "a1", email: "admin@example.com", role: "ADMIN" })
  getSecurityPolicy.mockResolvedValue(DEFAULT_SECURITY_POLICY)
  countPasskeyOnlyAdmins.mockResolvedValue(0)
})

describe("updateSecuritySettings", () => {
  it("saves an allowed change, with who made it", async () => {
    const result = await updateSecuritySettings({ enforceTwoFactor: true })
    expect(result).toEqual({ ok: true, policy: { ...DEFAULT_SECURITY_POLICY, enforceTwoFactor: true } })
    expect(saveSecurityPolicy).toHaveBeenCalledWith({ ...DEFAULT_SECURITY_POLICY, enforceTwoFactor: true }, "admin@example.com")
  })

  it("refuses anyone the admin gate refuses", async () => {
    getAdminUser.mockResolvedValue(null)
    expect(await updateSecuritySettings({ enforceTwoFactor: true })).toEqual({ ok: false, error: "unauthorized" })
    expect(saveSecurityPolicy).not.toHaveBeenCalled()
  })

  it("refuses unknown fields, wrong types and empty changes", async () => {
    expect(await updateSecuritySettings({ role: "ADMIN" })).toEqual({ ok: false, error: "invalid" })
    expect(await updateSecuritySettings({ totpEnabled: "no" })).toEqual({ ok: false, error: "invalid" })
    expect(await updateSecuritySettings({})).toEqual({ ok: false, error: "invalid" })
    expect(saveSecurityPolicy).not.toHaveBeenCalled()
  })

  it("keeps the last method on", async () => {
    getSecurityPolicy.mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, passkeyEnabled: false })
    expect(await updateSecuritySettings({ totpEnabled: false })).toEqual({ ok: false, error: "last-method" })
    expect(saveSecurityPolicy).not.toHaveBeenCalled()
  })

  it("will not turn passkeys off while an admin signs in only with one", async () => {
    countPasskeyOnlyAdmins.mockResolvedValue(1)
    expect(await updateSecuritySettings({ passkeyEnabled: false })).toEqual({ ok: false, error: "admins-passkey-only" })
    expect(saveSecurityPolicy).not.toHaveBeenCalled()
    countPasskeyOnlyAdmins.mockResolvedValue(0)
    expect((await updateSecuritySettings({ passkeyEnabled: false })).ok).toBe(true)
  })
})
