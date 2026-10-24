/**
 * Stores the affiliate program (the rules are in affiliates.ts).
 *
 * - `joinAffiliateProgram` makes a user an affiliate with the code they chose.
 * - `recordAffiliateClick` runs on every visit through a link (/go/{code}).
 * - `recordAffiliateSignup` runs when an account is created (src/auth.ts).
 * - `recordAffiliateCommission` runs on every payment the Stripe webhook sees,
 *   and `reverseAffiliateCommission` on a full refund.
 * - `affiliateDashboard` feeds /dashboard/affiliate.
 *
 * Recording clicks and signups never throws: tracking is a bonus, and it must
 * never break a redirect or a signup. Commission recording does throw, so the
 * webhook answers with an error and Stripe delivers the payment again: money
 * owed is not a bonus.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { readCookie } from "@/lib/seo/attribution"
import { CHECKOUT_BLOCKING_STATUSES } from "@/lib/billing"
import { mayRefer } from "./referrals"
import { AFFILIATE_COMMISSION, AFFILIATE_COOKIE, AFFILIATE_DASHBOARD_DAYS, claimableAffiliateCode, commissionFor, conversionRate, dailySeries, normalizeAffiliateCode, type DailyCount } from "./affiliates"

export type JoinResult = { ok: true; code: string } | { ok: false; error: "invalid" | "taken" | "already" }

export async function joinAffiliateProgram(userId: string, rawCode: string): Promise<JoinResult> {
  const code = normalizeAffiliateCode(rawCode)
  if (!code || !claimableAffiliateCode(code)) return { ok: false, error: "invalid" }
  if (await prisma.affiliate.findUnique({ where: { userId }, select: { id: true } })) return { ok: false, error: "already" }
  try {
    await prisma.affiliate.create({ data: { userId, code } })
    return { ok: true, code }
  } catch (error) {
    // Both unique columns land here: the code someone else has, or a second
    // join from this user racing the first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = String((error.meta as { target?: unknown } | undefined)?.target ?? "")
      return { ok: false, error: target.includes("userId") ? "already" : "taken" }
    }
    throw error
  }
}

/** Records one visit through a link. Returns whether the code belongs to an active affiliate. */
export async function recordAffiliateClick(code: string, visit: { path: string; refHost: string | null; unique: boolean }): Promise<boolean> {
  try {
    const affiliate = await prisma.affiliate.findUnique({ where: { code }, select: { id: true, active: true } })
    if (!affiliate?.active) return false
    await prisma.affiliateClick.create({ data: { affiliateId: affiliate.id, path: visit.path, refHost: visit.refHost, unique: visit.unique } })
    return true
  } catch (error) {
    console.warn("[affiliates] click not recorded", error)
    return false
  }
}

/** Records the affiliate a new account signed up through, from the sx_aff cookie. */
export async function recordAffiliateSignup(userId: string, headers: { get(name: string): string | null } | null | undefined): Promise<void> {
  try {
    const code = normalizeAffiliateCode(readCookie(headers?.get("cookie"), AFFILIATE_COOKIE))
    if (!code) return
    const [affiliate, user] = await Promise.all([
      prisma.affiliate.findUnique({ where: { code }, select: { id: true, active: true, user: { select: { id: true, email: true } } } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }),
    ])
    // An affiliate signing up a second account of their own is not a customer they found.
    if (!affiliate?.active || !user || !mayRefer(affiliate.user, user)) return
    await prisma.user.update({ where: { id: userId }, data: { affiliateId: affiliate.id } })
  } catch (error) {
    console.warn("[affiliates] signup not recorded", error)
  }
}

export type CommissionablePayment = {
  /** The Stripe invoice id, or the PaymentIntent id for a one-time purchase. */
  sourceId: string
  paymentIntentId: string | null
  customer: { userId: string } | { stripeCustomerId: string }
  /** What was paid, in the currency's minor unit. */
  amount: number
  currency: string
  paidAt: Date
}

/**
 * Records the commission a payment earned, when the customer came through an
 * affiliate and is still inside their window. Idempotent on `sourceId`, so a
 * replayed webhook is a no-op. Returns the commission recorded, or 0.
 */
export async function recordAffiliateCommission(payment: CommissionablePayment): Promise<number> {
  if (payment.amount <= 0) return 0
  const customer = await prisma.user.findUnique({
    where: "userId" in payment.customer ? { id: payment.customer.userId } : { stripeCustomerId: payment.customer.stripeCustomerId },
    select: { id: true, referredByAffiliate: { select: { id: true, active: true } } },
  })
  const affiliate = customer?.referredByAffiliate
  if (!customer || !affiliate?.active) return 0
  if (await prisma.affiliateCommission.findUnique({ where: { sourceId: payment.sourceId }, select: { id: true } })) return 0

  // The window opens at the customer's first commissionable payment, this
  // one when there is none before it.
  const first = await prisma.affiliateCommission.findFirst({
    where: { customerId: customer.id },
    orderBy: { paidAt: "asc" },
    select: { paidAt: true },
  })
  const commission = commissionFor(payment.amount, payment.paidAt, first?.paidAt ?? payment.paidAt)
  if (commission <= 0) return 0
  try {
    await prisma.affiliateCommission.create({
      data: {
        affiliateId: affiliate.id,
        customerId: customer.id,
        sourceId: payment.sourceId,
        paymentIntentId: payment.paymentIntentId,
        amount: payment.amount,
        commission,
        currency: payment.currency.toLowerCase(),
        percent: AFFILIATE_COMMISSION.percent,
        paidAt: payment.paidAt,
      },
    })
    return commission
  } catch (error) {
    // Two deliveries of the same event racing each other: the other one won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0
    throw error
  }
}

/** Takes back the commission on a fully refunded payment. Idempotent. */
export async function reverseAffiliateCommission(paymentIntentId: string, now = new Date()): Promise<void> {
  await prisma.affiliateCommission.updateMany({
    where: { OR: [{ paymentIntentId }, { sourceId: paymentIntentId }], reversedAt: null },
    data: { reversedAt: now },
  })
}

export type AffiliateDashboard = {
  code: string
  active: boolean
  days: number
  totals: { clicks: number; visitors: number; signups: number; paying: number; conversion: number | null }
  allTime: { signups: number; paying: number }
  /** Commission per currency, in minor units: earned (not reversed), and the part not yet paid out. */
  earnings: { currency: string; earned: number; unpaid: number }[]
  series: DailyCount[]
  recent: { id: string; name: string; joinedAt: Date; paying: boolean }[]
}

/** The affiliate's numbers, or null when the user has not joined. */
export async function affiliateDashboard(userId: string, now = new Date()): Promise<AffiliateDashboard | null> {
  const affiliate = await prisma.affiliate.findUnique({ where: { userId }, select: { id: true, code: true, active: true } })
  if (!affiliate) return null
  const days = AFFILIATE_DASHBOARD_DAYS
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 86_400_000)
  // "Paying" is a subscription Stripe still manages, or a lifetime purchase:
  // the same test getEntitlement uses (src/lib/billing.ts).
  const payingWhere: Prisma.UserWhereInput = {
    OR: [
      { subscription: { status: { in: [...CHECKOUT_BLOCKING_STATUSES] } } },
      { purchases: { some: { status: "COMPLETED" } } },
    ],
  }
  const [clicks, signups, allSignups, allPaying, recent, earned, unpaid] = await Promise.all([
    prisma.affiliateClick.findMany({ where: { affiliateId: affiliate.id, createdAt: { gte: since } }, select: { createdAt: true, unique: true }, take: 100_000 }),
    prisma.user.findMany({ where: { affiliateId: affiliate.id, createdAt: { gte: since } }, select: { createdAt: true, ...payingSelect() }, take: 100_000 }),
    prisma.user.count({ where: { affiliateId: affiliate.id } }),
    prisma.user.count({ where: { affiliateId: affiliate.id, ...payingWhere } }),
    prisma.user.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, createdAt: true, ...payingSelect() } }),
    prisma.affiliateCommission.groupBy({ by: ["currency"], where: { affiliateId: affiliate.id, reversedAt: null }, _sum: { commission: true } }),
    prisma.affiliateCommission.groupBy({ by: ["currency"], where: { affiliateId: affiliate.id, reversedAt: null, paidOutAt: null }, _sum: { commission: true } }),
  ])
  const visitors = clicks.filter((c) => c.unique).length
  return {
    code: affiliate.code,
    active: affiliate.active,
    days,
    totals: {
      clicks: clicks.length,
      visitors,
      signups: signups.length,
      paying: signups.filter(isPaying).length,
      conversion: conversionRate(signups.length, visitors),
    },
    allTime: { signups: allSignups, paying: allPaying },
    earnings: earned.map((row) => ({
      currency: row.currency,
      earned: row._sum.commission ?? 0,
      unpaid: unpaid.find((u) => u.currency === row.currency)?._sum.commission ?? 0,
    })),
    series: dailySeries(clicks.map((c) => c.createdAt), signups.map((s) => s.createdAt), days, now),
    recent: recent.map((u) => ({
      id: u.id,
      // First name only, as on the referrals page: the affiliate sees that
      // someone joined, not who they are.
      name: u.name.trim().split(/\s+/)[0] || "",
      joinedAt: u.createdAt,
      paying: isPaying(u),
    })),
  }
}

function payingSelect() {
  return {
    subscription: { select: { status: true } },
    purchases: { where: { status: "COMPLETED" as const }, select: { id: true }, take: 1 },
  }
}

function isPaying(u: { subscription: { status: string } | null; purchases: { id: string }[] }): boolean {
  return u.purchases.length > 0 || (u.subscription !== null && (CHECKOUT_BLOCKING_STATUSES as readonly string[]).includes(u.subscription.status))
}
