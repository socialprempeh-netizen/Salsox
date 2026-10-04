/**
 * Gives each paid plan a real Stripe test-mode price, in place of the
 * placeholder the seed writes when the STRIPE_*_PRICE_ID variables are unset.
 *
 * Checkout sends Stripe whatever `Plan.stripePriceId` holds, so a database
 * seeded without those variables fails every Upgrade button. Setting the
 * variables afterwards changes nothing until something writes the column, and
 * re-running the seed would also rewrite the copy and trial settings. This
 * creates the missing products and prices in Stripe, then updates only
 * `stripePriceId`, only on plans that still hold a placeholder, matched by slug.
 * The decisions are in src/lib/stripe-plan-prices.ts.
 *
 * Test mode only: it refuses any key but sk_test_. Re-running is safe: prices
 * are created under a lookup key per plan and products under a fixed ID, so a
 * second run finds what the first made instead of creating duplicates.
 *
 * Dry run by default: it prints the database and Stripe mode it is using and
 * every change it would make, reading from Stripe without writing. Add --apply
 * to write.
 *
 *   npm run db:stripe-prices                        # local database, dry run
 *   DATABASE_URL="postgresql://..." npm run db:stripe-prices -- --apply
 */
import Stripe from "stripe"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { examplePlans } from "./plans"
import {
  PLAN_CURRENCY,
  testKeyProblem,
  isPlaceholderPriceId,
  lookupKeyFor,
  productIdFor,
  priceMatchesPlan,
  planPriceAction,
  describePlanPrice,
  type StoredPrice,
  type LookupPrice,
} from "../src/lib/stripe-plan-prices"

const apply = process.argv.includes("--apply")
const url = process.env.DATABASE_URL
const key = process.env.STRIPE_SECRET_KEY
if (!url) {
  console.error("DATABASE_URL is not set.")
  process.exit(1)
}
const keyProblem = testKeyProblem(key)
if (keyProblem) {
  console.error(keyProblem)
  process.exit(1)
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
const stripe = new Stripe(key!, { apiVersion: "2026-08-26.dahlia", typescript: true })

/** Host and database name, never the password: read it before applying. */
function describe(connection: string): string {
  try {
    const u = new URL(connection)
    return `${u.hostname}${u.port ? `:${u.port}` : ""} / ${u.pathname.replace(/^\//, "")}`
  } catch {
    return "(unparseable DATABASE_URL)"
  }
}

const isMissing = (error: unknown) => (error as { code?: string }).code === "resource_missing"

/** What Stripe says about the price ID a plan holds now. */
async function storedPrice(plan: Parameters<typeof priceMatchesPlan>[1] & { stripePriceId: string }): Promise<StoredPrice> {
  if (isPlaceholderPriceId(plan.stripePriceId)) return "placeholder"
  try {
    return priceMatchesPlan(await stripe.prices.retrieve(plan.stripePriceId), plan) ? "matches" : "differs"
  } catch (error) {
    if (isMissing(error)) return "missing"
    throw error
  }
}

/** Whether the tier's product exists yet; created on --apply when it does not. */
async function productExists(id: string): Promise<boolean> {
  try {
    await stripe.products.retrieve(id)
    return true
  } catch (error) {
    if (isMissing(error)) return false
    throw error
  }
}

async function main() {
  console.log(`Database: ${describe(url!)}`)
  console.log("Stripe:   test mode (sk_test_)")
  console.log(apply ? "Mode: APPLY (writing changes)\n" : "Mode: dry run (add --apply to write)\n")

  // Active, fixed-price plans only. The metered example needs a Billing Meter
  // set up by hand first (docs/billing.md), so it is not created here.
  const slugs = examplePlans.filter((p) => p.isActive !== false && !p.meterEventName).map((p) => p.slug)
  const rows = await prisma.plan.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true, name: true, price: true, interval: true, stripePriceId: true, isActive: true },
  })
  const bySlug = new Map(rows.map((r) => [r.slug, r]))

  const existing = await stripe.prices.list({ lookup_keys: slugs.map(lookupKeyFor), limit: 100 })
  const byLookupKey = new Map(existing.data.map((p) => [p.lookup_key, p]))

  // Products already confirmed or created in this run, so a tier's second
  // plan neither looks it up again nor reports creating it twice.
  const products = new Map<string, boolean>()
  let changes = 0
  let createdProducts = 0
  let createdPrices = 0
  let leftForAPerson = 0

  for (const slug of slugs) {
    const row = bySlug.get(slug)
    if (!row) {
      console.log(`- ${slug}: not in this database, skipped (the seed creates plans; this only fixes their price IDs)`)
      continue
    }
    if (!row.isActive) {
      console.log(`- ${slug}: inactive in this database, skipped`)
      continue
    }
    const found = byLookupKey.get(lookupKeyFor(slug))
    const lookup: LookupPrice = found ? { id: found.id, matches: priceMatchesPlan(found, row) } : null
    const action = planPriceAction(await storedPrice(row), lookup)
    const label = `${slug} (${row.name}, ${describePlanPrice(row)})`

    if (action.kind === "up-to-date") {
      console.log(`- ${label}: up to date (${row.stripePriceId})`)
      continue
    }
    if (action.kind === "stored-differs") {
      leftForAPerson++
      console.log(`- ${label}: LEFT AS IS. Stored price ${row.stripePriceId} exists but charges a different amount or schedule; change it by hand if that is not intended.`)
      continue
    }
    if (action.kind === "stored-unknown") {
      leftForAPerson++
      console.log(`- ${label}: LEFT AS IS. Stored price ${row.stripePriceId} is not in this test-mode account (a live-mode price?); only placeholders are replaced.`)
      continue
    }
    if (action.kind === "lookup-conflict") {
      leftForAPerson++
      console.log(`- ${label}: LEFT AS IS. Lookup key "${lookupKeyFor(slug)}" belongs to ${action.priceId}, which does not match this plan (archived, or a different amount); archive or fix it in Stripe, then re-run.`)
      continue
    }

    changes++
    const lines: string[] = []
    let newPriceId = action.kind === "use-existing" ? action.priceId : "(new price, created on --apply)"

    if (action.kind === "create") {
      const productId = productIdFor(slug)
      if (!products.has(productId)) {
        const exists = await productExists(productId)
        products.set(productId, exists)
        if (!exists) {
          // The tier is named after its monthly (or one-time) plan: "Personal", not "Personal Yearly".
          const tierRows = rows.filter((r) => productIdFor(r.slug) === productId)
          const name = (tierRows.find((r) => r.interval !== "YEAR") ?? row).name
          createdProducts++
          lines.push(`  product:       ${productId} "${name}" ${apply ? "created" : "would be created"}`)
          if (apply) await stripe.products.create({ id: productId, name })
        }
      }
      lines.push(`  price:         ${describePlanPrice(row)} under lookup key "${lookupKeyFor(slug)}" ${apply ? "created" : "would be created"}`)
      createdPrices++
      if (apply) {
        const created = await stripe.prices.create({
          product: productId,
          unit_amount: row.price,
          currency: PLAN_CURRENCY,
          lookup_key: lookupKeyFor(slug),
          nickname: row.name,
          ...(row.interval === "ONE_TIME" ? {} : { recurring: { interval: row.interval === "MONTH" ? "month" : "year" } }),
        })
        newPriceId = created.id
      }
    } else {
      lines.push(`  price:         reusing ${action.priceId}, made by an earlier run`)
    }

    lines.unshift(`  stripePriceId: "${row.stripePriceId}" → "${newPriceId}"`)
    console.log(`- ${label}:\n${lines.join("\n")}`)
    if (apply) {
      await prisma.plan.update({ where: { id: row.id }, data: { stripePriceId: newPriceId } })
    }
  }

  const verb = apply ? "" : "would be "
  console.log(`\n${changes} plan(s) ${apply ? "updated" : "would change"}; ${createdProducts} product(s) and ${createdPrices} price(s) ${verb}created in Stripe.`)
  if (leftForAPerson) console.log(`${leftForAPerson} plan(s) left as is: see above.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
