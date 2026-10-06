/**
 * Stores and summarises signup attribution (the rules are in attribution.ts).
 *
 * `recordSignupAttribution` runs when an account is created, from Better
 * Auth's user-creation hook in src/auth.ts, so password and OAuth signups are
 * both covered. It never throws: losing attribution must never fail a
 * signup.
 *
 * `signupSummary` feeds the admin SEO page: signups per channel and the
 * landing pages organic visitors signed up from.
 */
import { prisma } from "@/lib/prisma"
import { ATTRIBUTION_COOKIE, CHANNELS, classifyChannel, parseTouch, readCookie, type Channel } from "./attribution"

export async function recordSignupAttribution(userId: string, headers: { get(name: string): string | null } | null | undefined): Promise<void> {
  try {
    const touch = parseTouch(readCookie(headers?.get("cookie"), ATTRIBUTION_COOKIE))
    await prisma.user.update({
      where: { id: userId },
      data: { acquisition: touch ?? undefined, signupChannel: classifyChannel(touch) },
    })
  } catch (error) {
    console.warn("[attribution] not recorded", error)
  }
}

export type SignupSummary = {
  days: number
  total: number
  byChannel: { channel: Channel | "unknown"; count: number }[]
  organicLandingPages: { path: string; count: number }[]
}

/** Signups in the last `days` days, by channel, and organic signups by landing page. */
export async function signupSummary(days = 30, now = new Date()): Promise<SignupSummary> {
  const since = new Date(now.getTime() - days * 86_400_000)
  const [grouped, organic] = await Promise.all([
    prisma.user.groupBy({ by: ["signupChannel"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.user.findMany({ where: { createdAt: { gte: since }, signupChannel: "organic_search" }, select: { acquisition: true }, take: 5000 }),
  ])
  const counts = new Map<string, number>(grouped.map((g) => [g.signupChannel ?? "unknown", g._count._all]))
  const pages = new Map<string, number>()
  for (const { acquisition } of organic) {
    const lp = (acquisition as { lp?: unknown } | null)?.lp
    if (typeof lp === "string") pages.set(lp, (pages.get(lp) ?? 0) + 1)
  }
  return {
    days,
    total: [...counts.values()].reduce((a, b) => a + b, 0),
    byChannel: [...CHANNELS, "unknown" as const].map((channel) => ({ channel, count: counts.get(channel) ?? 0 })),
    organicLandingPages: [...pages].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 15),
  }
}
