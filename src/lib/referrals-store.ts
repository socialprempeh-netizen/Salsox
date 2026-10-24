/**
 * Stores peer referrals (the rules are in referrals.ts).
 *
 * - `recordReferral` runs when an account is created (src/auth.ts) and links
 *   it to the account whose invite cookie it carries.
 * - `rewardReferrer` runs when a document is sent (sendDocument) and, the
 *   first time an invited account sends, adds free Pro months to its inviter.
 * - `referralSummary` feeds the referrals page.
 *
 * The first two never throw: a referral is a bonus, and it must never fail a
 * signup or a send.
 */
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { readCookie } from "@/lib/seo/attribution"
import { extendReferralPro, generateReferralCode, mayRefer, normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_REWARD_MONTHS, referralStatus } from "./referrals"

/** The user's invite code, made on first use. Retries the rare collision. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })
  if (user.referralCode) return user.referralCode
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode()
    try {
      // Conditional on still having none, so two tabs opening the page at
      // once end up showing the same code.
      const set = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } })
      if (set.count === 1) return code
      return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } })).referralCode!
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error
    }
  }
  throw new Error("Could not make a unique invite code")
}

/** Links a new account to its inviter, from the sx_ref cookie on the signup request. */
export async function recordReferral(userId: string, headers: { get(name: string): string | null } | null | undefined): Promise<void> {
  try {
    const code = normalizeReferralCode(readCookie(headers?.get("cookie"), REFERRAL_COOKIE))
    if (!code) return
    const [referrer, referee] = await Promise.all([
      prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, email: true } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, referredById: true } }),
    ])
    if (!referrer || !referee || referee.referredById || !mayRefer(referrer, referee)) return
    await prisma.user.update({ where: { id: userId }, data: { referredById: referrer.id } })
  } catch (error) {
    console.warn("[referrals] not recorded", error)
  }
}

/**
 * Grants the inviter of `refereeId` their free months, the first time the
 * invited account sends a document. Safe to call on every send: anything
 * after the first finds the reward already there.
 */
export async function rewardReferrer(refereeId: string, now = new Date()): Promise<void> {
  try {
    const referee = await prisma.user.findUnique({
      where: { id: refereeId },
      select: { referredById: true, referralRewardFor: { select: { id: true } } },
    })
    if (!referee?.referredById || referee.referralRewardFor) return
    const referrerId = referee.referredById
    await prisma.$transaction(async (tx) => {
      // Read inside the transaction and written with the reward row, whose
      // unique refereeId makes a concurrent second grant fail as a whole.
      const referrer = await tx.user.findUniqueOrThrow({ where: { id: referrerId }, select: { referralProUntil: true } })
      const proUntil = extendReferralPro(referrer.referralProUntil, now)
      await tx.referralReward.create({ data: { referrerId, refereeId, months: REFERRAL_REWARD_MONTHS, proUntil } })
      await tx.user.update({ where: { id: referrerId }, data: { referralProUntil: proUntil } })
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return
    console.warn("[referrals] reward not granted", error)
  }
}

export type ReferralSummary = {
  code: string
  proUntil: Date | null
  invited: { id: string; name: string; joinedAt: Date; status: "joined" | "active"; rewardedAt: Date | null }[]
}

/** What the referrals page shows: the code, the free time earned, and who joined. */
export async function referralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId)
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      referralProUntil: true,
      referrals: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, name: true, createdAt: true, referralRewardFor: { select: { createdAt: true } } },
      },
    },
  })
  return {
    code,
    proUntil: user.referralProUntil,
    invited: user.referrals.map((r) => ({
      id: r.id,
      // First name only: the inviter knows who they invited, and the page
      // should not hand them anyone's full name or address.
      name: r.name.trim().split(/\s+/)[0] || "",
      joinedAt: r.createdAt,
      status: referralStatus({ rewarded: Boolean(r.referralRewardFor) }),
      rewardedAt: r.referralRewardFor?.createdAt ?? null,
    })),
  }
}
