import { PrismaClient, BillingInterval } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

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
const priceId = (value: string | undefined, placeholder: string) => value?.trim() || placeholder

const examplePlans: {
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
    description: "For freelancers and individuals. Unlimited documents, no envelope caps.",
    price: 900,
    interval: "MONTH",
    stripePriceId: priceId(process.env.STRIPE_STARTER_PRICE_ID, "price_starter_placeholder"),
    features: ["Unlimited documents and signers", "Quick Send", "WhatsApp and SMS signing links", "Export everything, any time"],
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
    description: "Get paid as you get signed. Unlimited documents, no envelope caps.",
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

async function main() {
  for (const plan of examplePlans) {
    const { slug, ...data } = plan
    await prisma.plan.upsert({
      where: { slug },
      // keep the Stripe price ID (and copy tweaks) in sync with env on re-seed
      update: {
        stripePriceId: data.stripePriceId,
        description: data.description,
        meterEventName: data.meterEventName ?? null,
        trialDays: data.trialDays ?? null,
      },
      create: { slug, ...data },
    })
  }

  console.log(`Seed complete: ${examplePlans.length} example plans upserted`)
}

main()
  .catch((error) => {
    console.error(error)
    // Without this the process exits 0, and Prisma signs off with "The seed
    // command has been executed" after a seed that did nothing.
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
