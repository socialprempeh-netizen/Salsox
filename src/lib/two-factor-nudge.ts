/**
 * Whether to show a user the one-time suggestion to turn on 2FA, read from
 * the database. The rule (a payout account, no 2FA, not dismissed) is
 * showPayoutTwoFactorNudge in two-factor-policy.ts; this only gathers its
 * inputs. Used by the dashboard home and the payouts page.
 */
import { prisma } from "@/lib/prisma"
import { isTwoFactorEnrolled, showPayoutTwoFactorNudge } from "@/lib/two-factor-policy"

export async function shouldShowTwoFactorNudge(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      twoFactorEnabled: true,
      twoFactorNudgeDismissedAt: true,
      twoFactor: { select: { verified: true } },
      _count: { select: { payoutAccounts: true } },
    },
  })
  if (!user) return false
  return showPayoutTwoFactorNudge({
    enrolled: isTwoFactorEnrolled(user),
    payoutAccounts: user._count.payoutAccounts,
    dismissedAt: user.twoFactorNudgeDismissedAt,
  })
}
