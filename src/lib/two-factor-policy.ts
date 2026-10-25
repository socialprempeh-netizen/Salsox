/**
 * Who must have two-factor authentication, and what to do about someone who
 * does not, as pure rules. The database reads are in src/lib/auth/index.ts;
 * the pages and actions only act on the answers.
 *
 * - Regular accounts: optional. A user turns it on from Settings.
 * - Admin accounts: mandatory, and checked twice. The account must be
 *   enrolled, and the session in use must have passed a second factor. The
 *   second check is what makes it "required at login": Better Auth asks for
 *   the code on a password sign-in only, so an admin who arrives through a
 *   linked Google account holds a session that never saw the code. That
 *   session is sent to a one-step check instead of into the admin area.
 * - Payout accounts: someone who can receive money gets a one-time,
 *   dismissible suggestion to turn it on. A suggestion, never a gate.
 */

/**
 * Enrolled means both halves agree: the flag Better Auth reads at sign-in,
 * and an authenticator row that a correct code verified. A setup abandoned
 * halfway leaves an unverified row and no flag, and counts as not enrolled.
 */
export function isTwoFactorEnrolled(user: { twoFactorEnabled: boolean | null | undefined; twoFactor: { verified: boolean }[] }): boolean {
  return Boolean(user.twoFactorEnabled) && user.twoFactor.some((row) => row.verified)
}

export type AdminAccess = "ok" | "enroll" | "verify" | "not-admin"

/**
 * What stands between a signed-in user and the admin area: nothing ("ok"),
 * enrolling ("enroll"), or proving the second factor on this session
 * ("verify"). Anyone who is not an admin is "not-admin", whatever else is true.
 */
export function adminAccess(input: { role: string; enrolled: boolean; sessionVerified: boolean }): AdminAccess {
  if (input.role !== "ADMIN") return "not-admin"
  if (!input.enrolled) return "enroll"
  return input.sessionVerified ? "ok" : "verify"
}

/** Where each blocked step sends the admin. */
export const ADMIN_ENROLL_PATH = "/dashboard/settings?error=admin-2fa#two-factor"
export const ADMIN_VERIFY_PATH = "/dashboard/admin-verify"

/**
 * Whether to suggest 2FA to someone who can be paid out: they have a payout
 * account, have not turned 2FA on, and have not dismissed the suggestion.
 */
export function showPayoutTwoFactorNudge(input: { enrolled: boolean; payoutAccounts: number; dismissedAt: Date | null }): boolean {
  return input.payoutAccounts > 0 && !input.enrolled && input.dismissedAt === null
}

/** Share of a group with 2FA, as a whole percentage, or null for an empty group. */
export function enrollmentShare(enrolled: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((enrolled / total) * 100)
}
