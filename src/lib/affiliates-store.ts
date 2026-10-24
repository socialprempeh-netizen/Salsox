/**
 * Stores the affiliate program (the rules are in affiliates.ts).
 *
 * - `joinAffiliateProgram` makes a user an affiliate with the code they chose.
 * - `recordAffiliateClick` runs on every visit through a link (/go/{code}).
 * - `recordAffiliateSignup` runs when an account is created (src/auth.ts).
 * - `affiliateDashboard` feeds /dashboard/affiliate.
 *
 * Recording never throws: tracking is a bonus, and it must never break a
 * redirect or a signup.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { readCookie } from "@/lib/seo/attribution"
import { CHECKOUT_BLOCKING_STATUSES } from "@/lib/billing"
import { mayRefer } from "./referrals"
import { AFFILIATE_COOKIE, AFFILIATE_DASHBOARD_DAYS, claimableAffiliateCode, conversionRate, dailySeries, normalizeAffiliateCode, type DailyCount } from "./affiliates"

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

export type AffiliateDashboard = {
  code: string
  active: boolean
  days: number
  totals: { clicks: number; visitors: number; signups: number; paying: number; conversion: number | null }
  allTime: { signups: number; paying: number }
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
  const [clicks, signups, allSignups, allPaying, recent] = await Promise.all([
    prisma.affiliateClick.findMany({ where: { affiliateId: affiliate.id, createdAt: { gte: since } }, select: { createdAt: true, unique: true }, take: 100_000 }),
    prisma.user.findMany({ where: { affiliateId: affiliate.id, createdAt: { gte: since } }, select: { createdAt: true, ...payingSelect() }, take: 100_000 }),
    prisma.user.count({ where: { affiliateId: affiliate.id } }),
    prisma.user.count({ where: { affiliateId: affiliate.id, ...payingWhere } }),
    prisma.user.findMany({ where: { affiliateId: affiliate.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, name: true, createdAt: true, ...payingSelect() } }),
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
