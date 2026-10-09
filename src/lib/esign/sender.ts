/**
 * The sender's standing, loaded from the database for the rules in
 * `sending-limits.ts`.
 *
 * Read from the database on every call, not from the session: the session
 * cookie is cached for a minute (src/auth.ts), and a sender who has just
 * clicked the confirmation link should be able to send at once, not a minute
 * later.
 *
 * Usage is counted from rows that already exist (documents by `sentAt`), so
 * the daily ceiling is shared by every server instance and survives restarts,
 * which the in-memory rate limiter on its own does not.
 */
import { prisma } from "@/lib/prisma"
import { getEntitlement } from "@/lib/billing"
import { documentsLeft, hasFeature, tierForEntitlement, type PlanTier } from "./plans"
import {
  dailyWindowStart,
  emailConfirmationRequired,
  sendingBlocker,
  type SendingBlocker,
} from "./sending-limits"

/**
 * The reason this user may not email recipients now, or null when they may.
 * `addingRecipients` is the recipient count of a document about to be sent;
 * pass 0 for reminders, renewals and corrections.
 */
export async function senderBlocker(
  userId: string,
  addingRecipients: number,
  now = new Date()
): Promise<SendingBlocker | "notFound" | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { emailVerified: true, createdAt: true } })
  if (!user) return "notFound"

  const since = dailyWindowStart(now)
  // Only a new send consumes the ceiling, so only a new send pays for the counts.
  const [documents, recipients] =
    addingRecipients > 0
      ? await Promise.all([
          prisma.document.count({ where: { userId, sentAt: { gte: since } } }),
          prisma.recipient.count({ where: { document: { userId, sentAt: { gte: since } } } }),
        ])
      : [0, 0]

  return sendingBlocker(
    { emailVerified: user.emailVerified, accountCreatedAt: user.createdAt, usage: { documents, recipients } },
    addingRecipients,
    now
  )
}

/**
 * The sender's plan, for the gates in plans.ts: their tier, and how many
 * signature requests they may still send (null when unlimited). Read from
 * billing on every call, like the standing above, so an upgrade applies as
 * soon as the Stripe webhook lands.
 *
 * Counted from every document the account has ever sent, not this month's:
 * the free allowance is one request in total (FREE_SIGNATURE_REQUESTS). A
 * sent document cannot be deleted (only drafts can, deleteDraft), so the
 * count cannot be reset by deleting what was sent. `now` is unused since the
 * count stopped being monthly; it stays so callers need not change.
 */
export async function senderPlan(userId: string, now = new Date()): Promise<{ tier: PlanTier; documentsLeft: number | null }> {
  void now
  const tier = tierForEntitlement(await getEntitlement(userId))
  if (hasFeature(tier, "unlimitedDocuments")) return { tier, documentsLeft: null }
  const sentEver = await prisma.document.count({ where: { userId, sentAt: { not: null } } })
  return { tier, documentsLeft: documentsLeft(tier, sentEver) }
  // Was this month's sends only:
  // const sentThisMonth = await prisma.document.count({ where: { userId, sentAt: { gte: monthStartUtc(now) } } })
  // return { tier, documentsLeft: documentsLeft(tier, sentThisMonth) }
}

/** For the dashboard notice: the address still to confirm, or null when nothing is needed. */
export async function emailAwaitingConfirmation(userId: string): Promise<string | null> {
  if (!emailConfirmationRequired()) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  return user && !user.emailVerified ? user.email : null
}
