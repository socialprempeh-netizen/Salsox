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

/** For the dashboard notice: the address still to confirm, or null when nothing is needed. */
export async function emailAwaitingConfirmation(userId: string): Promise<string | null> {
  if (!emailConfirmationRequired()) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, emailVerified: true } })
  return user && !user.emailVerified ? user.email : null
}
