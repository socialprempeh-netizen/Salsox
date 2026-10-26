/**
 * Stores the affiliate program (the rules are in affiliates.ts).
 *
 * - `joinAffiliateProgram` makes a user an affiliate with the code they chose.
 * - `recordAffiliateClick` runs on every visit through a link (/go/{code}).
 * - `recordAffiliateSignup` runs when an account is created (src/auth.ts).
 * - `recordAffiliateCommission` runs on every payment the Stripe webhook sees,
 *   and `reverseAffiliateCommission` on a full refund.
 * - `affiliateDashboard` feeds /dashboard/affiliate.
 * - `affiliatePayoutQueue` and `recordAffiliatePayout` feed the admin's
 *   payouts tab (/admin/revenue/affiliates): what has cleared, and marking
 *   it paid once the money is sent.
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
import { AFFILIATE_COMMISSION, AFFILIATE_COOKIE, AFFILIATE_DASHBOARD_DAYS, claimableAffiliateCode, clearedCutoff, nextPayoutDate, payoutDue, commissionFor, commissionMonth, conversionRate, dailySeries, monthRange, normalizeAffiliateCode, rerateMonth, type DailyCount } from "./affiliates"

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
  const provisional = commissionFor(payment.amount, payment.paidAt, first?.paidAt ?? payment.paidAt)
  if (provisional <= 0) return 0
  try {
    // Written at the base rate, then the whole month is re-rated to its tier
    // in the same transaction, this payment included (src/lib/affiliates.ts).
    return await prisma.$transaction(async (tx) => {
      const row = await tx.affiliateCommission.create({
        data: {
          affiliateId: affiliate.id,
          customerId: customer.id,
          sourceId: payment.sourceId,
          paymentIntentId: payment.paymentIntentId,
          amount: payment.amount,
          commission: provisional,
          currency: payment.currency.toLowerCase(),
          percent: AFFILIATE_COMMISSION.basePercent,
          paidAt: payment.paidAt,
        },
        select: { id: true },
      })
      const changes = await rerateCustomerMonth(tx, customer.id, payment.paidAt)
      return changes.find((c) => c.id === row.id)?.commission ?? provisional
    })
  } catch (error) {
    // Two deliveries of the same event racing each other: the other one won.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return 0
    throw error
  }
}

/** Takes back the commission on a fully refunded payment. Idempotent. */
export async function reverseAffiliateCommission(paymentIntentId: string, now = new Date()): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const where = { OR: [{ paymentIntentId }, { sourceId: paymentIntentId }], reversedAt: null }
    const rows = await tx.affiliateCommission.findMany({ where, select: { customerId: true, paidAt: true } })
    if (rows.length === 0) return
    await tx.affiliateCommission.updateMany({ where, data: { reversedAt: now } })
    // A refund lowers the month's net, which can drop it a tier for the rest.
    for (const r of rows) if (r.customerId) await rerateCustomerMonth(tx, r.customerId, r.paidAt)
  })
}

/**
 * Puts every row of one customer's month at the month's tier (rerateMonth in
 * affiliates.ts). Returns the rows it changed.
 */
async function rerateCustomerMonth(tx: Prisma.TransactionClient, customerId: string, paidAt: Date) {
  const { start, end } = monthRange(commissionMonth(paidAt))
  const rows = await tx.affiliateCommission.findMany({
    where: { customerId, paidAt: { gte: start, lt: end } },
    select: { id: true, amount: true, currency: true, reversedAt: true, paidOutAt: true, percent: true, commission: true },
  })
  const changes = rerateMonth(rows.map((r) => ({ id: r.id, amount: r.amount, currency: r.currency, reversed: r.reversedAt !== null, paidOut: r.paidOutAt !== null, percent: r.percent, commission: r.commission })))
  for (const c of changes) await tx.affiliateCommission.update({ where: { id: c.id }, data: { percent: c.percent, commission: c.commission } })
  return changes
}

export type AffiliateDashboard = {
  code: string
  active: boolean
  days: number
  totals: { clicks: number; visitors: number; signups: number; paying: number; conversion: number | null }
  allTime: { signups: number; paying: number }
  /**
   * Commission per currency, in minor units: earned (not reversed); not paid
   * out yet, split into pending (inside the refund hold) and cleared; paid
   * out. `due`: the cleared part is paid on `nextPayout`. Was
   * { currency, earned, unpaid }, before payouts had a schedule.
   */
  earnings: { currency: string; earned: number; pending: number; cleared: number; paidOut: number; due: boolean }[]
  nextPayout: Date
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
  const cutoff = clearedCutoff(now)
  const live = { affiliateId: affiliate.id, reversedAt: null }
  const sumBy = (where: Prisma.AffiliateCommissionWhereInput) => prisma.affiliateCommission.groupBy({ by: ["currency"], where, _sum: { commission: true } })
  const [clicks, signups, allSignups, allPaying, recent, earned, pending, cleared, paidOut] = await Promise.all([
    prisma.affiliateClick.findMany({ where: { affiliateId: affiliate.id, createdAt: { gte: since } }, select: { createdAt: true, unique: true }, take: 100_000 }),
    prisma.user.findMany({ where: { affiliateId: affiliate.id, createdAt: { gte: since } }, select: { createdAt: true, ...payingSelect() }, take: 100_000 }),
    prisma.user.count({ where: { affiliateId: affiliate.id } }),
    prisma.user.count({ where: { affiliateId: affiliate.id, ...payingWhere } }),
    prisma.user.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, createdAt: true, ...payingSelect() } }),
    sumBy(live),
    // Was one "unpaid" sum: { affiliateId, reversedAt: null, paidOutAt: null }.
    sumBy({ ...live, paidOutAt: null, paidAt: { gt: cutoff } }),
    sumBy({ ...live, paidOutAt: null, paidAt: { lte: cutoff } }),
    sumBy({ ...live, paidOutAt: { not: null } }),
  ])
  const sumOf = (rows: { currency: string; _sum: { commission: number | null } }[], currency: string) => rows.find((r) => r.currency === currency)?._sum.commission ?? 0
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
      pending: sumOf(pending, row.currency),
      cleared: sumOf(cleared, row.currency),
      paidOut: sumOf(paidOut, row.currency),
      due: payoutDue(sumOf(cleared, row.currency), row.currency),
    })),
    nextPayout: nextPayoutDate(now),
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

export type PayoutQueueRow = {
  affiliateId: string
  code: string
  email: string
  name: string
  currency: string
  /** Cleared, not reversed, not paid out: what a payout would send now, in minor units. */
  cleared: number
  rows: number
  /** At or over the currency's minimum, so it is paid on the next payout day. */
  due: boolean
}

/** Every affiliate's cleared balance per currency, largest first. */
export async function affiliatePayoutQueue(now = new Date()): Promise<PayoutQueueRow[]> {
  const grouped = await prisma.affiliateCommission.groupBy({
    by: ["affiliateId", "currency"],
    where: { reversedAt: null, paidOutAt: null, paidAt: { lte: clearedCutoff(now) } },
    _sum: { commission: true },
    _count: { _all: true },
  })
  const owed = grouped.filter((g) => (g._sum.commission ?? 0) > 0)
  if (owed.length === 0) return []
  const affiliates = await prisma.affiliate.findMany({
    where: { id: { in: [...new Set(owed.map((g) => g.affiliateId))] } },
    select: { id: true, code: true, user: { select: { email: true, name: true } } },
  })
  const byId = new Map(affiliates.map((a) => [a.id, a]))
  return owed
    .map((g) => {
      const a = byId.get(g.affiliateId)
      const cleared = g._sum.commission ?? 0
      return { affiliateId: g.affiliateId, code: a?.code ?? "", email: a?.user.email ?? "", name: a?.user.name ?? "", currency: g.currency, cleared, rows: g._count._all, due: payoutDue(cleared, g.currency) }
    })
    .sort((x, y) => y.cleared - x.cleared)
}

/**
 * Records that an affiliate's cleared balance in one currency has been sent:
 * every cleared, unpaid, unreversed row up to `now`'s cutoff gets paidOutAt.
 * The sum is read and the rows marked in one transaction, so what is
 * reported is exactly what was marked; a second click finds nothing left.
 */
export async function recordAffiliatePayout(affiliateId: string, currency: string, now = new Date()): Promise<{ rows: number; amount: number }> {
  const where = { affiliateId, currency, reversedAt: null, paidOutAt: null, paidAt: { lte: clearedCutoff(now) } }
  return prisma.$transaction(async (tx) => {
    const rows = await tx.affiliateCommission.findMany({ where, select: { id: true, commission: true } })
    if (rows.length === 0) return { rows: 0, amount: 0 }
    await tx.affiliateCommission.updateMany({ where: { id: { in: rows.map((r) => r.id) }, paidOutAt: null }, data: { paidOutAt: now } })
    return { rows: rows.length, amount: rows.reduce((sum, r) => sum + r.commission, 0) }
  })
}
