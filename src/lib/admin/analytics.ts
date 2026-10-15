/**
 * The arithmetic behind /admin/analytics and the overview tiles: weekly
 * counts, rates that cannot divide by zero, and plan-change classification
 * for the subscriptions page. Pure functions over plain values; the pages do
 * the queries.
 */

const DAY = 24 * 60 * 60 * 1000
const WEEK = 7 * DAY

export type WeekBucket = { start: Date; count: number }

/**
 * Counts of `dates` per week, oldest first, for the `weeks` weeks ending at
 * `now`. The last bucket is the current, partial week; dates outside the
 * range are ignored.
 */
export function weeklyCounts(dates: Date[], { weeks = 12, now = new Date() }: { weeks?: number; now?: Date } = {}): WeekBucket[] {
  const end = now.getTime()
  const start = end - weeks * WEEK
  const buckets = Array.from({ length: weeks }, (_, i) => ({ start: new Date(start + i * WEEK), count: 0 }))
  for (const date of dates) {
    const t = date.getTime()
    if (t <= start || t > end) continue
    const index = Math.min(weeks - 1, Math.floor((t - start) / WEEK))
    buckets[index].count++
  }
  return buckets
}

/** `part / whole` as a fraction, or null when there is nothing to divide by. */
export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}

/** A start date `days` before `now`. */
export function daysAgo(days: number, now = new Date()): Date {
  return new Date(now.getTime() - days * DAY)
}

/** The windows the revenue and analytics pages offer, in days. */
export const WINDOWS = [7, 30, 90] as const
export type WindowDays = (typeof WINDOWS)[number]

/** Reads `?days=` into one of WINDOWS, 30 by default. */
export function parseWindow(value: string | undefined): WindowDays {
  const n = Number(value)
  return (WINDOWS as readonly number[]).includes(n) ? (n as WindowDays) : 30
}

export type PlanPrice = { stripePriceId: string; price: number; interval: string }

/**
 * Whether moving from one Stripe price to another is an upgrade, a downgrade
 * or a change of billing interval at the same value, compared on the monthly
 * equivalent. Null when either price is not one of our plans.
 */
export function classifyPlanChange(fromPriceId: string, toPriceId: string, plans: PlanPrice[]): "upgrade" | "downgrade" | "lateral" | null {
  const monthly = (p: PlanPrice) => (p.interval === "YEAR" ? p.price / 12 : p.interval === "MONTH" ? p.price : 0)
  const from = plans.find((p) => p.stripePriceId === fromPriceId)
  const to = plans.find((p) => p.stripePriceId === toPriceId)
  if (!from || !to) return null
  const a = monthly(from)
  const b = monthly(to)
  return b > a ? "upgrade" : b < a ? "downgrade" : "lateral"
}

/** The middle value (mean of the two middle ones for an even count), or null for none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}
