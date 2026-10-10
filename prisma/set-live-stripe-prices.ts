/**
 * One-off: writes the live Stripe price IDs into `Plan.stripePriceId`,
 * matched by plan slug. A direct database update: Stripe is not called.
 *
 * Why it exists: the live prices were created by hand in the Stripe
 * dashboard, and prisma/create-stripe-prices.ts refuses live keys on purpose
 * (it creates objects, which in live mode should be a person's decision).
 * Checkout sends Stripe whatever this column holds, so until it holds these
 * IDs every Upgrade button on production fails or points at a test price.
 *
 * What it checks before writing (src/lib/stripe-price-assignment.ts): each
 * slug exists, bills on the interval its price was listed for, each ID looks
 * like a real price ID and is listed once, and no other plan already holds
 * it. One failed check stops the run with nothing written.
 *
 * Dry run by default: prints the database it is connected to (host and name,
 * never the password) and each change. Add --apply to write; the updates run
 * in one transaction, each guarded on the value read a moment before, so a
 * concurrent change rolls them all back instead of half-applying.
 *
 *   npm run db:stripe-live-prices                                      # local, dry run
 *   DATABASE_URL="postgresql://...prod..." npm run db:stripe-live-prices            # prod, dry run
 *   DATABASE_URL="postgresql://...prod..." npm run db:stripe-live-prices -- --apply
 *
 * Run it against production with the connection string in the shell for that
 * one command, not in a file (CLAUDE.md: a temporary credential file is
 * deleted the moment the command finishes).
 *
 * Afterwards, keep the seed from undoing it: prisma/seed.ts rewrites this
 * column from the STRIPE_*_PRICE_ID variables on every run, and writes
 * placeholders where they are unset. Re-seeding production therefore needs
 * those variables set to the same IDs (STRIPE_STARTER_PRICE_ID,
 * STRIPE_STARTER_YEARLY_PRICE_ID, STRIPE_PRO_PRICE_ID,
 * STRIPE_PRO_YEARLY_PRICE_ID, STRIPE_LIFETIME_PRICE_ID).
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import {
  describeAssignment,
  hasBlockingResult,
  planPriceAssignments,
  type PriceAssignment,
} from "../src/lib/stripe-price-assignment"

/**
 * The live prices, by the slugs in prisma/plans.ts: Personal is `starter-*`
 * and Business is `pro-*` (the tier rules in src/lib/esign/plans.ts read
 * those prefixes). The interval is what each price was created as in Stripe,
 * checked against the plan's own.
 */
const LIVE_PRICES: PriceAssignment[] = [
  { slug: "starter-monthly", interval: "MONTH", priceId: "price_1UOnmV5ijGZmZ4fBW0Av4HhY" }, // Personal, monthly
  { slug: "starter-yearly", interval: "YEAR", priceId: "price_1UOnqd5ijGZmZ4fBQLUzzCGE" }, // Personal, yearly
  { slug: "pro-monthly", interval: "MONTH", priceId: "price_1UOnxW5ijGZmZ4fBiMXvhped" }, // Business, monthly
  { slug: "pro-yearly", interval: "YEAR", priceId: "price_1UOnyN5ijGZmZ4fBlAx8RBWY" }, // Business, yearly
  { slug: "lifetime", interval: "ONE_TIME", priceId: "price_1UOo435ijGZmZ4fBmpbGEIdk" }, // Lifetime, one payment
]

const apply = process.argv.includes("--apply")
const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

/** Host and database name, never the password: read it before applying. */
function describe(connection: string): string {
  try {
    const u = new URL(connection)
    return `${u.hostname}${u.port ? `:${u.port}` : ""} / ${u.pathname.replace(/^\//, "")}`
  } catch {
    return "(unparseable DATABASE_URL)"
  }
}

async function main() {
  console.log(`Database: ${describe(url!)}`)
  console.log("Stripe:   not called (direct database update)")
  console.log(apply ? "Mode: APPLY (writing changes)\n" : "Mode: dry run (add --apply to write)\n")

  // Every plan, not only the five: the uniqueness check needs to see an ID
  // held by any other row.
  const rows = await prisma.plan.findMany({ select: { slug: true, interval: true, stripePriceId: true } })
  const results = planPriceAssignments(LIVE_PRICES, rows)
  for (const r of results) console.log(`- ${describeAssignment(r)}`)

  if (hasBlockingResult(results)) {
    console.error("\nStopped: fix the BLOCKED lines above. Nothing was written.")
    process.exitCode = 1
    return
  }

  const updates = results.filter((r) => r.action === "update")
  if (updates.length === 0) {
    console.log("\nNothing to change: every plan already holds its live price.")
    return
  }
  if (!apply) {
    console.log(`\nDry run: ${updates.length} plan(s) would change. Re-run with --apply to write.`)
    return
  }

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      // Guarded on the value just read: if it changed since, nothing is written.
      const { count } = await tx.plan.updateMany({ where: { slug: u.slug, stripePriceId: u.from }, data: { stripePriceId: u.to } })
      if (count !== 1) throw new Error(`${u.slug} changed while this ran; rolled back, nothing written.`)
    }
  })
  console.log(`\nApplied: ${updates.length} plan(s) updated.`)

  // Read back what is stored now, so the output is the proof.
  const after = await prisma.plan.findMany({
    where: { slug: { in: LIVE_PRICES.map((p) => p.slug) } },
    select: { slug: true, stripePriceId: true },
    orderBy: { slug: "asc" },
  })
  for (const p of after) console.log(`  ${p.slug}: ${p.stripePriceId}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
