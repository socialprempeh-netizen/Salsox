/**
 * The organisation's sign-in policy, set at /admin/security, as pure rules.
 * The row is SecuritySettings (read in src/lib/security-settings.ts); the
 * Better Auth gate in src/auth.ts, the dashboard layout, the settings pages
 * and the admin page all ask these functions rather than reading flags.
 *
 * - twoFactorEnabled: 2FA offered to users at all. Admins need it whatever
 *   this says (src/lib/two-factor-policy.ts), so it never applies to them.
 * - totpEnabled / passkeyEnabled: which methods can be newly set up. At least
 *   one stays on, or an admin could not enroll. Turning a method off never
 *   strips it from someone who has it: removing a factor from people's
 *   accounts behind their back is the opposite of what a security page is for.
 * - enforceTwoFactor: every user must set up a method before using the
 *   dashboard. Needs twoFactorEnabled; turning that off turns this off.
 * - sessionTimeoutMinutes: sign out after this long without activity, or null.
 */
import { z } from "zod"

export type AuthMethod = "totp" | "passkey"

export type SecurityPolicy = {
  twoFactorEnabled: boolean
  totpEnabled: boolean
  passkeyEnabled: boolean
  enforceTwoFactor: boolean
  sessionTimeoutMinutes: number | null
}

/** What the app did before the policy existed, and what a missing row means. */
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  twoFactorEnabled: true,
  totpEnabled: true,
  passkeyEnabled: true,
  enforceTwoFactor: false,
  sessionTimeoutMinutes: null,
}

/** The inactivity limits an admin can pick, in minutes. */
export const SESSION_TIMEOUT_CHOICES = [15, 30, 60, 120, 480] as const

/** One change from the admin page, re-parsed on the server whatever the form checked. */
export const securityPatchSchema = z
  .object({
    twoFactorEnabled: z.boolean(),
    totpEnabled: z.boolean(),
    passkeyEnabled: z.boolean(),
    enforceTwoFactor: z.boolean(),
    sessionTimeoutMinutes: z.union([z.literal(null), z.number().int()]),
  })
  .partial()
  .strict()
export type SecurityPatch = z.infer<typeof securityPatchSchema>

export type PatchError = "last-method" | "enforce-needs-2fa" | "timeout"

/**
 * The policy after a change, or why the change is refused. Turning 2FA off
 * also turns enforcement off, rather than refusing: it is the obvious
 * consequence, and the page shows it happening.
 */
export function applySecurityPatch(current: SecurityPolicy, patch: SecurityPatch): { ok: true; policy: SecurityPolicy } | { ok: false; error: PatchError } {
  const next = { ...current, ...patch }
  if (!next.totpEnabled && !next.passkeyEnabled) return { ok: false, error: "last-method" }
  if (patch.enforceTwoFactor === true && !next.twoFactorEnabled) return { ok: false, error: "enforce-needs-2fa" }
  if (!next.twoFactorEnabled) next.enforceTwoFactor = false
  const t = next.sessionTimeoutMinutes
  if (t !== null && !(SESSION_TIMEOUT_CHOICES as readonly number[]).includes(t)) return { ok: false, error: "timeout" }
  return { ok: true, policy: next }
}

/** The one method still on, which the page shows locked, or null while both are. */
export function lockedMethod(policy: SecurityPolicy): AuthMethod | null {
  if (policy.totpEnabled && !policy.passkeyEnabled) return "totp"
  if (policy.passkeyEnabled && !policy.totpEnabled) return "passkey"
  return null
}

/** Whether someone with this role may set up this method now. */
export function canEnroll(policy: SecurityPolicy, method: AuthMethod, role: string): boolean {
  const methodOn = method === "totp" ? policy.totpEnabled : policy.passkeyEnabled
  return methodOn && (role === "ADMIN" || policy.twoFactorEnabled)
}

/**
 * Whether a user must set up a method before using the dashboard. Admins are
 * left to their own, stricter rule. Someone with no method they could set up
 * (no password for the authenticator app, passkeys off) is not held at a
 * screen they cannot get past: that would be a lock-out, not a policy.
 */
export function mustEnrollNow(input: { policy: SecurityPolicy; role: string; enrolled: boolean; hasPassword: boolean }): boolean {
  const { policy, role, enrolled, hasPassword } = input
  if (enrolled || role === "ADMIN") return false
  if (!policy.twoFactorEnabled || !policy.enforceTwoFactor) return false
  return (policy.totpEnabled && hasPassword) || policy.passkeyEnabled
}
