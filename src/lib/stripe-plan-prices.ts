/**
 * The rules behind prisma/create-stripe-prices.ts, which gives each paid plan
 * a real Stripe price in place of the placeholder the seed writes when the
 * STRIPE_*_PRICE_ID variables are not set.
 *
 * Checkout sends Stripe whatever `Plan.stripePriceId` holds, so a placeholder
 * there fails every upgrade. These functions decide, per plan, whether the
 * stored ID is usable, whether a matching price already exists in Stripe, and
 * what the script should therefore do. The script itself only does the I/O.
 */

/** Plans have no currency column; prices are shown and charged in US dollars. */
export const PLAN_CURRENCY = "usd"

export type PlanInterval = "MONTH" | "YEAR" | "ONE_TIME"

/** The parts of a Plan row a Stripe price has to agree with. */
export type PlanPriceSpec = { slug: string; price: number; interval: PlanInterval }

/** The parts of a Stripe price compared against a plan. */
export type StripePriceSpec = {
  active: boolean
  unit_amount: number | null
  currency: string
  recurring: { interval: string; interval_count: number } | null
}

/**
 * Null when the key may be used, otherwise why not. Only a standard test-mode
 * key passes: this script creates objects, and doing that in live mode by
 * mistake would put test prices in front of paying customers.
 */
export function testKeyProblem(key: string | undefined): string | null {
  if (!key) return "STRIPE_SECRET_KEY is not set."
  if (key.startsWith("sk_test_")) return null
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "STRIPE_SECRET_KEY is a live-mode key. This script only runs in test mode."
  return "STRIPE_SECRET_KEY is not a standard test-mode key (sk_test_...). This script only runs with one."
}

/** True for anything Stripe cannot have issued: the seed's placeholders, or a value without the price_ prefix. */
export function isPlaceholderPriceId(id: string): boolean {
  return !id.startsWith("price_") || id.endsWith("_placeholder")
}

/**
 * The lookup key each plan's price is created under. Stripe keeps lookup keys
 * unique per account, which is what lets a re-run find the price it made last
 * time instead of creating a second one.
 */
export const lookupKeyFor = (slug: string) => `plan_${slug}`

/**
 * One Stripe product per tier, so the monthly and yearly prices of a plan sit
 * under the same product ("starter-monthly" and "starter-yearly" share
 * "starter"). Its ID is fixed, so finding it is a lookup, not a search.
 */
export const productIdFor = (slug: string) => `plan-product-${slug.split("-")[0]}`

/** Whether a Stripe price charges what the plan's card shows, on the plan's schedule. */
export function priceMatchesPlan(price: StripePriceSpec, plan: PlanPriceSpec): boolean {
  if (!price.active || price.unit_amount !== plan.price || price.currency !== PLAN_CURRENCY) return false
  if (plan.interval === "ONE_TIME") return price.recurring === null
  const interval = plan.interval === "MONTH" ? "month" : "year"
  return price.recurring?.interval === interval && price.recurring.interval_count === 1
}

/** What Stripe says about the ID stored on the plan. */
export type StoredPrice = "placeholder" | "missing" | "matches" | "differs"

/** What Stripe has under the plan's lookup key. */
export type LookupPrice = { id: string; matches: boolean } | null

export type PlanPriceAction =
  /** The stored ID is a real price that matches: nothing to do. */
  | { kind: "up-to-date" }
  /** The stored ID is a real price for a different amount or schedule: changing it is a pricing decision, left to a person. */
  | { kind: "stored-differs" }
  /**
   * The stored ID looks real but this account has no such price. It may be a
   * live-mode price, and replacing it with a test one would break live
   * checkout, so only placeholders are ever replaced.
   */
  | { kind: "stored-unknown" }
  /** A price made earlier (a previous run) already fits: point the plan at it. */
  | { kind: "use-existing"; priceId: string }
  /** The lookup key is taken by a price that does not fit: left to a person rather than moved. */
  | { kind: "lookup-conflict"; priceId: string }
  /** Nothing usable exists: create the price, then point the plan at it. */
  | { kind: "create" }

export function planPriceAction(stored: StoredPrice, existing: LookupPrice): PlanPriceAction {
  if (stored === "matches") return { kind: "up-to-date" }
  if (stored === "differs") return { kind: "stored-differs" }
  if (stored === "missing") return { kind: "stored-unknown" }
  if (!existing) return { kind: "create" }
  return existing.matches ? { kind: "use-existing", priceId: existing.id } : { kind: "lookup-conflict", priceId: existing.id }
}

/** "$9.00 / month", "$299.00 one-time": for the summary only. */
export function describePlanPrice(plan: PlanPriceSpec): string {
  const amount = `$${(plan.price / 100).toFixed(2)}`
  return plan.interval === "ONE_TIME" ? `${amount} one-time` : `${amount} / ${plan.interval === "MONTH" ? "month" : "year"}`
}
