/**
 * Whether the sign-in policy holds this person at the 2FA setup screen right
 * now (an admin enforcing 2FA, and no method set up yet). The dashboard
 * layout shows the setup screen in that case; pages outside the dashboard
 * that hand out access, such as the extension connect page, refuse until
 * the setup is done.
 *
 * The same reading the dashboard layout makes inline (src/app/(dashboard)/
 * layout.tsx), with the same rules (security-policy.ts, two-factor-policy.ts).
 */
import { prisma } from "@/lib/prisma"
import { getSecurityPolicy } from "@/lib/security-settings"
import { mustEnrollNow } from "@/lib/security-policy"
import { hasSecondFactor, isTwoFactorEnrolled } from "@/lib/two-factor-policy"
import type { CurrentUser } from "@/lib/auth"

export async function mustEnrollBeforeUse(user: Pick<CurrentUser, "id" | "role">): Promise<boolean> {
  const [account, policy] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        twoFactorEnabled: true,
        twoFactor: { select: { verified: true } },
        accounts: { where: { providerId: "credential" }, select: { id: true } },
        _count: { select: { passkeys: true } },
      },
    }),
    getSecurityPolicy(),
  ])
  if (!account) return false
  return mustEnrollNow({
    policy,
    role: user.role,
    // A passkey only counts while passkeys can sign in.
    enrolled: hasSecondFactor({ totp: isTwoFactorEnrolled(account), passkeys: policy.passkeyEnabled ? account._count.passkeys : 0 }),
    hasPassword: account.accounts.length > 0,
  })
}
