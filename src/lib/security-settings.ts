/**
 * Reads and writes the organisation's sign-in policy (the SecuritySettings
 * row, id 1). The rules that interpret it are in security-policy.ts.
 *
 * Reading never throws: a missing row, or a database not yet migrated, means
 * the defaults, which are exactly how sign-in behaved before the policy
 * existed. Sign-in must not break because a settings row is missing.
 */
import { prisma } from "@/lib/prisma"
import { DEFAULT_SECURITY_POLICY, type SecurityPolicy } from "@/lib/security-policy"

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  try {
    const row = await prisma.securitySettings.findUnique({ where: { id: 1 } })
    if (!row) return DEFAULT_SECURITY_POLICY
    return {
      twoFactorEnabled: row.twoFactorEnabled,
      totpEnabled: row.totpEnabled,
      passkeyEnabled: row.passkeyEnabled,
      enforceTwoFactor: row.enforceTwoFactor,
      sessionTimeoutMinutes: row.sessionTimeoutMinutes,
    }
  } catch (error) {
    console.warn("[security] policy unreadable, using defaults", error)
    return DEFAULT_SECURITY_POLICY
  }
}

/** Stores a policy already checked by applySecurityPatch, with who changed it. */
export async function saveSecurityPolicy(policy: SecurityPolicy, updatedBy: string): Promise<void> {
  await prisma.securitySettings.upsert({
    where: { id: 1 },
    update: { ...policy, updatedBy },
    create: { id: 1, ...policy, updatedBy },
  })
}

/**
 * Admins whose only second factor is a passkey: no verified authenticator
 * app. Turning passkeys off would shut them out of the admin area, so the
 * policy action refuses it while this is above zero.
 */
export async function countPasskeyOnlyAdmins(): Promise<number> {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      passkeys: { some: {} },
      NOT: { twoFactorEnabled: true, twoFactor: { some: { verified: true } } },
    },
  })
}
