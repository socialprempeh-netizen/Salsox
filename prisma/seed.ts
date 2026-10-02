import { PrismaClient } from "@prisma/client"
import { examplePlans } from "./plans"
import { PrismaPg } from "@prisma/adapter-pg"

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

// The plan list lives in ./plans.ts, shared with sync-plan-copy.ts.


async function main() {
  for (const plan of examplePlans) {
    const { slug, ...data } = plan
    await prisma.plan.upsert({
      where: { slug },
      // keep the Stripe price ID (and copy tweaks) in sync with env on re-seed
      // The copy is kept in sync too (name and features were create-only,
      // so a correction here never reached a database seeded earlier and the
      // pricing cards kept the old wording). Price, interval and isActive are
      // not: those are business decisions made in the database or Stripe.
      update: {
        stripePriceId: data.stripePriceId,
        name: data.name,
        description: data.description,
        features: data.features,
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
