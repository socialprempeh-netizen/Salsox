/**
 * Salsox's plans: the single definition the seed (prisma/seed.ts) and the
 * copy sync (prisma/sync-plan-copy.ts) both read.
 *
 * Moved out of the seed so the pricing cards' words can be corrected in a
 * database without re-running the seed there: the seed also writes each
 * plan's Stripe price ID from the environment, which on a machine without
 * the production variables is a placeholder that would break checkout.
 */
import type { BillingInterval } from "@prisma/client"

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLE plans — these exist so the Stripe checkout flow works out of the box.
// They are NOT OpenStarterKit's own pricing (the kit itself is free; its paid
// "Pro · Teams" tier is still in design). Replace name/description/features/price
// with YOUR product's plans, and set real Stripe price IDs via the env vars below
// (or hard-code your own). The six plans demonstrate every billing pattern the
// kit supports: monthly, yearly, one-time (lifetime) and metered (usage-based,
// seeded inactive: see docs/billing.md to enable it).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `.env.example` ships every unused variable as VAR="", so an empty string has
 * to mean "not configured" here too. With `??` it reached the database, and six
 * plans sharing one empty price ID break the unique index on the second upsert:
 * the seed failed for anyone who copied the example file, which is what the
 * guide tells you to do.
 */
export const priceId = (value: string | undefined, placeholder: string) => value?.trim() || placeholder

export const examplePlans: {
  slug: string
  name: string
  description: string
  price: number
  interval: BillingInterval
  stripePriceId: string
  features: string[]
  meterEventName?: string
  trialDays?: number
  isActive?: boolean
}[] = [
  {
    slug: "starter-monthly",
    name: "Personal",
    // Was "... Unlimited sending — fair-use limits apply to prevent spam.":
    // free accounts are capped (one signature request in total, was 3
    // documents a month: src/lib/esign/plans.ts), so "unlimited" is
    // what this plan adds, not what every plan has.
    description: "For freelancers and individuals. Unlimited documents, with fair-use limits that stop spam.",
    price: 900,
    interval: "MONTH",
    stripePriceId: priceId(process.env.STRIPE_STARTER_PRICE_ID, "price_starter_placeholder"),
    // "and signers" removed: each document takes at most 10 recipients.
    features: ["Unlimited documents", "Quick Send", "WhatsApp and SMS signing links", "Export everything, any time"],
  },
  {
    slug: "starter-yearly",
    name: "Personal Yearly",
    description: "Personal, billed yearly: 2 months free. Renewal reminder sent in advance.",
    price: 9000,
    interval: "YEAR",
    stripePriceId: priceId(process.env.STRIPE_STARTER_YEARLY_PRICE_ID, "price_starter_yearly_placeholder"),
    features: ["Everything in Personal", "2 months free", "Renewal reminder 7 days ahead"],
  },
  {
    slug: "pro-monthly",
    name: "Business",
    // Was "... Unlimited sending — fair-use limits apply to prevent spam.".
    description: "Get paid as you get signed. Everything in Personal, plus Sign & Pay, signing order and sealed PDFs.",
    price: 1900,
    interval: "MONTH",
    stripePriceId: priceId(process.env.STRIPE_PRO_PRICE_ID, "price_pro_placeholder"),
    // A free trial, to show the pattern: offered once per customer at checkout
    // (docs/billing.md). Remove the line and the plan has none.
    trialDays: 14,
    features: [
      "Everything in Personal",
      "Sign & Pay (Stripe or Paystack)",
      "Sequential signing and approvers",
      "Digitally sealed PDFs with audit certificate",
      "Priority support",
    ],
  },
  {
    slug: "pro-yearly",
    name: "Business Yearly",
    description: "Business, billed yearly: 2 months free. Renewal reminder sent in advance.",
    price: 19000,
    interval: "YEAR",
    stripePriceId: priceId(process.env.STRIPE_PRO_YEARLY_PRICE_ID, "price_pro_yearly_placeholder"),
    features: ["Everything in Business", "2 months free", "Renewal reminder 7 days ahead"],
  },
  {
    slug: "lifetime",
    name: "Lifetime",
    description: "Pay once, sign forever. No subscription to cancel.",
    price: 29900,
    interval: "ONE_TIME",
    stripePriceId: priceId(process.env.STRIPE_LIFETIME_PRICE_ID, "price_lifetime_placeholder"),
    features: ["Everything in Business", "All future updates", "No recurring billing"],
  },
  {
    // Usage-based example, seeded INACTIVE so it never shows up in the UI until
    // you have created a Billing Meter + metered price in Stripe (docs/billing.md).
    slug: "metered-example",
    name: "Pay as you go",
    description: "Example usage-based plan billed per API request",
    price: 0,
    interval: "MONTH",
    stripePriceId: priceId(process.env.STRIPE_METERED_PRICE_ID, "price_metered_placeholder"),
    features: ["Billed per API request", "No monthly minimum"],
    meterEventName: "api_request",
    isActive: false,
  },
]
