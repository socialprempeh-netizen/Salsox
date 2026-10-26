/**
 * The affiliate program, as pure rules. Peer referrals (referrals.ts) reward
 * users with free months; affiliates are partners who send traffic and are
 * paid for customers, so they get their own link, cookie and dashboard.
 *
 * - An affiliate joins from /dashboard/affiliate and picks a code. Links are
 *   /go/{code}, optionally /go/{code}?to=/pricing to land on a given page.
 * - Opening a link records a click (src/app/go/[code]/route.ts) and keeps the
 *   code in the first-party sx_aff cookie for AFFILIATE_COOKIE_DAYS.
 * - At signup the server reads the cookie and records the affiliate on the
 *   new account (src/auth.ts, via affiliates-store.ts). The last affiliate
 *   link a visitor used wins, the usual rule for affiliate cookies.
 * - The dashboard counts clicks, unique visitors, signups and signups that
 *   now pay, and the commission those payments earned.
 * - Commission is recurring and tiered: for the AFFILIATE_COMMISSION.months
 *   after a referred customer's first payment, each payment earns the rate
 *   of that customer's net revenue in its calendar month (UTC): the base
 *   rate, or a higher tier once the month passes a threshold. The Stripe
 *   webhook writes one ledger row per payment and re-rates the month's rows
 *   (affiliates-store.ts).
 * - Payouts (AFFILIATE_PAYOUT): a commission clears once the payment it came
 *   from is past the refund window, and cleared commission is paid monthly,
 *   once it reaches the currency's minimum. /admin/revenue/affiliates lists
 *   what is due and records a payout; sending the money is still done by
 *   hand (bank transfer or PayPal) until a payout provider is chosen.
 *
 * The database side is in affiliates-store.ts.
 */

export const AFFILIATE_COOKIE = "sx_aff"
export const AFFILIATE_COOKIE_DAYS = 60
export const AFFILIATE_DASHBOARD_DAYS = 30

/**
 * The commission terms, in one place: the webhook, the dashboard and the
 * join page all read them from here. Changing a term applies to payments
 * recorded from then on; each ledger row keeps the percent it was paid at.
 *
 * Was a flat rate: { percent: 20, months: 12 }. Now tiered, on the model of
 * the larger e-signature programs: 25% base, 35% in a month the customer
 * pays over USD 100 net, 45% over USD 250. Tiers are per customer and per
 * calendar month, in minor units of 	ierCurrency; a payment in another
 * currency earns the base rate until thresholds are set for it.
 */
// export const AFFILIATE_COMMISSION = { percent: 20, months: 12 } as const
export const AFFILIATE_COMMISSION = {
  months: 12,
  basePercent: 25,
  tierCurrency: "usd",
  // Highest first is not required; tierPercent takes the best tier passed.
  tiers: [
    { over: 10_000, percent: 35 },
    { over: 25_000, percent: 45 },
  ],
} as const

/**
 * The rate for a customer's month, from their net revenue that month (minor
 * units). "Over" is strict: exactly USD 100 stays at the base rate.
 */
export function tierPercent(monthNet: number, currency: string): number {
  let percent: number = AFFILIATE_COMMISSION.basePercent
  if (currency.toLowerCase() !== AFFILIATE_COMMISSION.tierCurrency) return percent
  for (const tier of AFFILIATE_COMMISSION.tiers) if (monthNet > tier.over && tier.percent > percent) percent = tier.percent
  return percent
}

/** The calendar month (UTC) a payment counts toward, as "yyyy-mm". */
export function commissionMonth(paidAt: Date): string {
  return paidAt.toISOString().slice(0, 7)
}

/** The first and the day after the last instant of a "yyyy-mm" month, UTC. */
export function monthRange(month: string): { start: Date; end: Date } {
  const [y, m] = month.split("-").map(Number)
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) }
}

export type MonthRow = { id: string; amount: number; currency: string; reversed: boolean; paidOut: boolean; percent: number; commission: number }

/**
 * Re-rates one customer's month: every live row takes the month's tier, set
 * by the net of the live rows in the same currency. Reversed rows earn
 * nothing and do not count; rows already paid out keep what they were paid,
 * since a payout is money that has left. Returns only the rows that change.
 */
export function rerateMonth(rows: MonthRow[]): { id: string; percent: number; commission: number }[] {
  const netBy = new Map<string, number>()
  for (const r of rows) if (!r.reversed) netBy.set(r.currency, (netBy.get(r.currency) ?? 0) + r.amount)
  const changes: { id: string; percent: number; commission: number }[] = []
  for (const r of rows) {
    if (r.reversed || r.paidOut) continue
    const percent = tierPercent(netBy.get(r.currency) ?? 0, r.currency)
    const commission = commissionAt(r.amount, percent)
    if (percent !== r.percent || commission !== r.commission) changes.push({ id: r.id, percent, commission })
  }
  return changes
}

/** A percent of an amount in minor units, rounded down to the unit. */
export function commissionAt(amount: number, percent: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.floor((amount * percent) / 100)
}

/** The end of a customer's commission window, AFFILIATE_COMMISSION.months after their first payment. */
export function commissionWindowEnd(firstPaidAt: Date): Date {
  const end = new Date(firstPaidAt)
  end.setUTCMonth(end.getUTCMonth() + AFFILIATE_COMMISSION.months)
  return end
}

/**
 * The commission on one payment, in the payment's minor unit (cents),
 * rounded down so the ledger never owes a fraction of a cent. Zero for a
 * payment of nothing, and for one made after the window closed.
 * `firstPaidAt` is the customer's first commissionable payment; for that
 * first payment it is the payment's own date.
 */
export function commissionFor(amount: number, paidAt: Date, firstPaidAt: Date): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (paidAt.getTime() >= commissionWindowEnd(firstPaidAt).getTime()) return 0
  // Was Math.floor((amount * AFFILIATE_COMMISSION.percent) / 100): the flat
  // rate. This is now the provisional base-rate figure for a new row, before
  // rerateMonth lifts the month to its tier.
  return commissionAt(amount, AFFILIATE_COMMISSION.basePercent)
}

/** Whether a payment falls inside the customer's commission window. */
export function inCommissionWindow(paidAt: Date, firstPaidAt: Date): boolean {
  return paidAt.getTime() < commissionWindowEnd(firstPaidAt).getTime()
}

// Codes that would read as the product speaking, or that someone could use
// to pass a link off as official.
const RESERVED = new Set(["admin", "api", "app", "billing", "dashboard", "help", "login", "official", "pricing", "salsox", "signup", "support", "team"])

/**
 * The code in canonical form, or null when it cannot be one: 3 to 24
 * characters, lower-case letters, digits and single hyphens inside.
 */
export function normalizeAffiliateCode(raw: string | null | undefined): string | null {
  const code = (raw ?? "").trim().toLowerCase()
  return /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){2,23}$/.test(code) ? code : null
}

/** Whether a code may be claimed: well formed and not reserved. */
export function claimableAffiliateCode(raw: string): boolean {
  const code = normalizeAffiliateCode(raw)
  return code !== null && !RESERVED.has(code)
}

/** The pages an affiliate link may land on. Anything else lands on the home page. */
export const AFFILIATE_DESTINATIONS = ["/", "/pricing", "/request-signature", "/templates"] as const

/**
 * Where a link sends the visitor: a path on this site only, never another
 * site, so an affiliate link cannot be turned into an open redirect.
 */
export function affiliateDestination(to: string | null | undefined): string {
  const path = (to ?? "").trim()
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/"
  const bare = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  return (AFFILIATE_DESTINATIONS as readonly string[]).includes(bare) ? bare : "/"
}

/** An affiliate link, for a destination on this site. */
export function affiliateLink(code: string, appUrl: string, to = "/"): string {
  const base = `${appUrl.replace(/\/+$/, "")}/go/${code}`
  const dest = affiliateDestination(to)
  return dest === "/" ? base : `${base}?to=${encodeURIComponent(dest)}`
}

// Crawlers, link unfurlers and monitors open links too; counting them would
// make every shared link look busier than it is.
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|slack|linkedinbot|headless|lighthouse|pingdom|uptime|curl|wget|python-requests|httpclient|go-http/i

/** Whether a user agent is a machine, not a person. An empty one counts as a machine. */
export function isBot(userAgent: string | null | undefined): boolean {
  return !userAgent || BOT.test(userAgent)
}

export type DailyCount = { date: string; clicks: number; signups: number }

/** The last `days` UTC days ending today, each with its clicks and signups, oldest first. */
export function dailySeries(clicks: Date[], signups: Date[], days: number, now: Date): DailyCount[] {
  const key = (d: Date) => d.toISOString().slice(0, 10)
  const out = new Map<string, DailyCount>()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  for (let i = days - 1; i >= 0; i--) {
    const date = key(new Date(today - i * 86_400_000))
    out.set(date, { date, clicks: 0, signups: 0 })
  }
  for (const d of clicks) {
    const row = out.get(key(d))
    if (row) row.clicks++
  }
  for (const d of signups) {
    const row = out.get(key(d))
    if (row) row.signups++
  }
  return [...out.values()]
}

/** Signups per unique visitor, as a percentage with one decimal, or null with no visitors. */
export function conversionRate(signups: number, visitors: number): number | null {
  if (visitors <= 0) return null
  return Math.round((signups / visitors) * 1000) / 10
}

/**
 * When and how commission is paid out. A payment can be refunded for a while
 * after it is made, and a refund reverses its commission
 * (reverseAffiliateCommission), so commission waits `holdDays` before it
 * counts as cleared. Cleared commission is paid on `dayOfMonth` (UTC) of each
 * month, per currency, once it reaches that currency's minimum (minor
 * units); a currency without one has no minimum.
 *
 * TODO: the transfer itself. Today an admin sends the money by hand and
 * records it on /admin/revenue/affiliates; a payout provider (Stripe Connect
 * Express, PayPal Payouts or Wise) would replace the "by hand" step and call
 * the same record function.
 */
export const AFFILIATE_PAYOUT = {
  holdDays: 30,
  dayOfMonth: 15,
  minimum: { usd: 5_000 } as Record<string, number>,
} as const

/** The instant a commission earned on a payment at `paidAt` clears. */
export function commissionClearsAt(paidAt: Date): Date {
  return new Date(paidAt.getTime() + AFFILIATE_PAYOUT.holdDays * 86_400_000)
}

/** Payments made at or before this instant have cleared by `now`. */
export function clearedCutoff(now: Date): Date {
  return new Date(now.getTime() - AFFILIATE_PAYOUT.holdDays * 86_400_000)
}

/** The next payout day at or after `now`'s date: this month's, or next month's once it has passed. */
export function nextPayoutDate(now: Date): Date {
  const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), AFFILIATE_PAYOUT.dayOfMonth))
  return now.getUTCDate() <= AFFILIATE_PAYOUT.dayOfMonth ? thisMonth : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, AFFILIATE_PAYOUT.dayOfMonth))
}

/** The minimum cleared balance paid out in a currency, in minor units. */
export function payoutMinimum(currency: string): number {
  return AFFILIATE_PAYOUT.minimum[currency.toLowerCase()] ?? 0
}

/** Whether a cleared balance is paid on the next payout day. */
export function payoutDue(cleared: number, currency: string): boolean {
  return cleared > 0 && cleared >= payoutMinimum(currency)
}
