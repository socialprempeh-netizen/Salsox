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
 * - Commission is recurring: AFFILIATE_COMMISSION.percent of every payment a
 *   referred customer makes during the AFFILIATE_COMMISSION.months after
 *   their first one. The Stripe webhook writes one ledger row per payment
 *   (affiliates-store.ts); payouts are settled by hand from that ledger.
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
 */
export const AFFILIATE_COMMISSION = { percent: 20, months: 12 } as const

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
  return Math.floor((amount * AFFILIATE_COMMISSION.percent) / 100)
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
