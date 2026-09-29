/**
 * "No silent auto-renewal": every active subscription gets an email ahead of
 * its renewal date, with the price and a one-click way to cancel. The notice
 * is sent once per billing period (tracked by `renewalNoticeSentAt`).
 */
import type { BillingInterval } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { sendRenewalNotice } from "./emails"

/** How far ahead of the renewal the notice goes out. */
export function noticeLeadDays(interval: BillingInterval): number {
  return interval === "YEAR" ? 14 : 7
}

/**
 * Whether a subscription is due a notice now: renewing within the lead time,
 * not cancelling, and not yet noticed for this period (a notice sent before
 * the current period started belongs to the previous one).
 */
export function isRenewalNoticeDue(
  sub: {
    status: string
    cancelAtPeriodEnd: boolean
    currentPeriodStart: Date
    currentPeriodEnd: Date
    renewalNoticeSentAt: Date | null
    interval: BillingInterval
  },
  now: Date
): boolean {
  if (sub.status !== "ACTIVE" && sub.status !== "TRIALING") return false
  if (sub.cancelAtPeriodEnd || sub.interval === "ONE_TIME") return false
  const msLeft = sub.currentPeriodEnd.getTime() - now.getTime()
  if (msLeft <= 0 || msLeft > noticeLeadDays(sub.interval) * 24 * 60 * 60 * 1000) return false
  return !sub.renewalNoticeSentAt || sub.renewalNoticeSentAt < sub.currentPeriodStart
}

export async function renewalNoticeSweep(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)
  const subs = await prisma.subscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gt: now, lte: horizon },
    },
    include: { plan: true, user: { select: { email: true, name: true } } },
    take: 500,
  })
  let sent = 0
  for (const sub of subs) {
    if (!isRenewalNoticeDue({ ...sub, interval: sub.plan.interval }, now)) continue
    // Claim first, so two overlapping cron runs cannot both email.
    const claimed = await prisma.subscription.updateMany({
      where: { id: sub.id, renewalNoticeSentAt: sub.renewalNoticeSentAt },
      data: { renewalNoticeSentAt: now },
    })
    if (claimed.count === 0) continue
    await sendRenewalNotice({
      to: sub.user.email,
      name: sub.user.name || sub.user.email,
      plan: sub.plan.name,
      date: sub.currentPeriodEnd.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
      amount: new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(sub.plan.price / 100),
      manageUrl: `${siteConfig.url}/dashboard/billing`,
    })
    sent++
  }
  return sent
}
