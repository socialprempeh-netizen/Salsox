import type { PrismaClient, SubscriptionStatus, BillingInterval } from "@prisma/client"

/**
 * The demo dataset, and the function that (re)writes it.
 *
 * Lives here rather than inside prisma/seed-demo.ts because two callers need
 * it: the CLI script (`npm run db:seed:demo`) and the scheduled reset route
 * (`/api/cron/reset-demo`). Two copies of this would drift, and the demo would
 * end up looking different depending on which one last ran.
 *
 * ⚠️ Running it WIPES all users and everything cascading from them. That is
 * the point: it is how the public demo goes back to a known state. Never point
 * it at a database with real users.
 */

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY)
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY)

/** Same example plans as the regular seed (prisma/seed.ts). */
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
    description: "For freelancers and individuals. Unlimited sending — fair-use limits apply to prevent spam.",
    price: 900,
    interval: "MONTH",
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID ?? "price_starter_placeholder",
    features: ["Unlimited documents and signers", "Quick Send", "WhatsApp and SMS signing links", "Export everything, any time"],
  },
  {
    slug: "starter-yearly",
    name: "Personal Yearly",
    description: "Personal, billed yearly: 2 months free. Renewal reminder sent in advance.",
    price: 9000,
    interval: "YEAR",
    stripePriceId: process.env.STRIPE_STARTER_YEARLY_PRICE_ID ?? "price_starter_yearly_placeholder",
    features: ["Everything in Personal", "2 months free", "Renewal reminder 7 days ahead"],
  },
  {
    slug: "pro-monthly",
    name: "Business",
    description: "Get paid as you get signed. Unlimited sending — fair-use limits apply to prevent spam.",
    price: 1900,
    interval: "MONTH",
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? "price_pro_placeholder",
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
    stripePriceId: process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? "price_pro_yearly_placeholder",
    features: ["Everything in Business", "2 months free", "Renewal reminder 7 days ahead"],
  },
  {
    slug: "lifetime",
    name: "Lifetime",
    description: "Pay once, sign forever. No subscription to cancel.",
    price: 29900,
    interval: "ONE_TIME",
    stripePriceId: process.env.STRIPE_LIFETIME_PRICE_ID ?? "price_lifetime_placeholder",
    features: ["Everything in Business", "All future updates", "No recurring billing"],
  },
  {
    slug: "metered-example",
    name: "Pay as you go",
    description: "Example usage-based plan billed per API request",
    price: 0,
    interval: "MONTH",
    stripePriceId: process.env.STRIPE_METERED_PRICE_ID ?? "price_metered_placeholder",
    features: ["Billed per API request", "No monthly minimum"],
    meterEventName: "api_request",
    isActive: false,
  },
]

const fakeUsers: {
  name: string
  email: string
  signedUpDaysAgo: number
  plan?: "starter-monthly" | "pro-monthly" | "pro-yearly"
  subStatus?: SubscriptionStatus
  lifetime?: boolean
}[] = [
  { name: "Ada Lovelace", email: "ada@example.com", signedUpDaysAgo: 88, plan: "pro-yearly", subStatus: "ACTIVE" },
  { name: "Grace Hopper", email: "grace@example.com", signedUpDaysAgo: 80, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Alan Turing", email: "alan@example.com", signedUpDaysAgo: 74, lifetime: true },
  { name: "Margaret Hamilton", email: "margaret@example.com", signedUpDaysAgo: 66, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Linus Chen", email: "linus@example.com", signedUpDaysAgo: 59 },
  { name: "Sofia Almeida", email: "sofia@example.com", signedUpDaysAgo: 51, plan: "pro-monthly", subStatus: "PAST_DUE" },
  { name: "Yuki Tanaka", email: "yuki@example.com", signedUpDaysAgo: 45, plan: "pro-yearly", subStatus: "ACTIVE" },
  { name: "Omar Haddad", email: "omar@example.com", signedUpDaysAgo: 38 },
  { name: "Elena Petrova", email: "elena@example.com", signedUpDaysAgo: 30, plan: "pro-monthly", subStatus: "CANCELED" },
  { name: "Marco Rossi", email: "marco@example.com", signedUpDaysAgo: 24, plan: "starter-monthly", subStatus: "ACTIVE" },
  { name: "Priya Sharma", email: "priya@example.com", signedUpDaysAgo: 18, plan: "pro-monthly", subStatus: "TRIALING" },
  { name: "Tom Becker", email: "tom@example.com", signedUpDaysAgo: 12 },
  { name: "Aisha Bello", email: "aisha@example.com", signedUpDaysAgo: 7, plan: "starter-monthly", subStatus: "ACTIVE" },
  { name: "Jonas Weber", email: "jonas@example.com", signedUpDaysAgo: 3 },
  { name: "Lucia Fernandez", email: "lucia@example.com", signedUpDaysAgo: 1 },
  // A wider paying population, spread across the twelve weeks the chart covers,
  // so the line climbs instead of sitting on the axis. Dates are what make it a
  // curve; the plan mix is what gives it steps of different heights.
  { name: "Noah Lindqvist", email: "noah@example.com", signedUpDaysAgo: 84, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Amara Okafor", email: "amara@example.com", signedUpDaysAgo: 77, plan: "pro-yearly", subStatus: "ACTIVE" },
  { name: "Ines Moreau", email: "ines@example.com", signedUpDaysAgo: 71, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Kwame Mensah", email: "kwame@example.com", signedUpDaysAgo: 64, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Hana Kobayashi", email: "hana@example.com", signedUpDaysAgo: 57, plan: "starter-monthly", subStatus: "ACTIVE" },
  { name: "Diego Ramirez", email: "diego@example.com", signedUpDaysAgo: 49, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Freya Nilsen", email: "freya@example.com", signedUpDaysAgo: 43, plan: "pro-yearly", subStatus: "ACTIVE" },
  { name: "Samir Farouk", email: "samir@example.com", signedUpDaysAgo: 36, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Clara Bianchi", email: "clara@example.com", signedUpDaysAgo: 29, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Ravi Menon", email: "ravi@example.com", signedUpDaysAgo: 22, plan: "starter-monthly", subStatus: "ACTIVE" },
  { name: "Mia Sorensen", email: "mia@example.com", signedUpDaysAgo: 16, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Theo Vasquez", email: "theo@example.com", signedUpDaysAgo: 11, plan: "pro-monthly", subStatus: "ACTIVE" },
  { name: "Zara Haddadi", email: "zara@example.com", signedUpDaysAgo: 6, plan: "pro-yearly", subStatus: "ACTIVE" },
  { name: "Felix Braun", email: "felix@example.com", signedUpDaysAgo: 2, plan: "pro-monthly", subStatus: "TRIALING" },
]

export type DemoSeedResult = {
  users: number
  subscriptions: number
  purchases: number
  documents: number
}

export async function seedDemoData(prisma: PrismaClient): Promise<DemoSeedResult> {
  // Plans first (same example plans as the regular seed)
  const planBySlug = new Map<string, { id: string; price: number }>()
  for (const plan of examplePlans) {
    const { slug, ...data } = plan
    const row = await prisma.plan.upsert({
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
    planBySlug.set(slug, { id: row.id, price: row.price })
  }

  // Full reset: wipe users (cascades to subscriptions, purchases, documents,
  // accounts, sessions). Since 2.0 sessions are rows rather than cookies, so
  // this is also what signs out every visitor currently poking at the demo:
  // the cascade takes their session with the user it belonged to.
  await prisma.user.deleteMany()

  // Now that no subscription points at a plan any more, anything else that
  // ended up in the plan table goes too. A demo database is a showcase: a stray
  // plan left behind by a script or an experiment shows up on the pricing page
  // next to the real ones, and nobody looking at it can tell which is which.
  await prisma.plan.deleteMany({ where: { slug: { notIn: [...planBySlug.keys()] } } })

  // The two shared demo accounts (the login buttons upsert these too)
  await prisma.user.create({
    data: {
      email: "demo-user@example.com",
      name: "Demo User",
      // Required since 2.0. It defaults to false, so leaving it out would work
      // and would quietly show every seeded account as unverified.
      emailVerified: true,
      role: "USER",
      createdAt: daysAgo(10),
    },
  })
  await prisma.user.create({
    data: {
      email: "demo-admin@example.com",
      name: "Demo Admin",
      emailVerified: true,
      role: "ADMIN",
      createdAt: daysAgo(90),
    },
  })

  // Fake population
  let customerCounter = 0
  for (const fake of fakeUsers) {
    const createdAt = daysAgo(fake.signedUpDaysAgo)
    const hasBilling = Boolean(fake.plan || fake.lifetime)
    const user = await prisma.user.create({
      data: {
        email: fake.email,
        name: fake.name,
        emailVerified: true,
        role: "USER",
        createdAt,
        stripeCustomerId: hasBilling ? `cus_demo_${String(++customerCounter).padStart(3, "0")}` : null,
      },
    })

    if (fake.plan && fake.subStatus) {
      const plan = planBySlug.get(fake.plan)!
      const periodDays = fake.plan === "pro-yearly" ? 365 : 30
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          stripeSubscriptionId: `sub_demo_${String(customerCounter).padStart(3, "0")}`,
          status: fake.subStatus,
          // Without this every subscription looks created today, and the MRR
          // chart on the admin panel is a flat zero with a single spike at the
          // right edge: the history it is meant to show does not exist.
          createdAt,
          currentPeriodStart: daysAgo(Math.min(fake.signedUpDaysAgo, periodDays / 2)),
          currentPeriodEnd: daysFromNow(periodDays / 2),
          cancelAtPeriodEnd: fake.subStatus === "CANCELED",
          // During a trial Stripe ends the first period when the trial ends,
          // so the two dates are the same one.
          trialEndsAt: fake.subStatus === "TRIALING" ? daysFromNow(periodDays / 2) : null,
        },
      })
    }

    if (fake.lifetime) {
      const plan = planBySlug.get("lifetime")!
      await prisma.purchase.create({
        data: {
          userId: user.id,
          planId: plan.id,
          stripePaymentIntentId: `pi_demo_${String(customerCounter).padStart(3, "0")}`,
          stripeCheckoutSessionId: `cs_demo_${String(customerCounter).padStart(3, "0")}`,
          amount: plan.price,
          createdAt: daysAgo(Math.max(fake.signedUpDaysAgo - 2, 0)),
        },
      })
    }
  }

  const [users, subscriptions, purchases, documents] = await Promise.all([
    prisma.user.count(),
    prisma.subscription.count(),
    prisma.purchase.count(),
    prisma.document.count(),
  ])

  return { users, subscriptions, purchases, documents }
}
