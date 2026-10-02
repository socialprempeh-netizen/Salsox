/**
 * Brings the pricing cards' words in a database up to date with prisma/plans.ts,
 * and touches nothing else.
 *
 * The cards on /pricing read each plan's name, description and features from
 * the database, so correcting the copy in code does not change a database
 * that was seeded earlier. Re-running the seed against production is not the
 * fix: it also writes every plan's Stripe price ID from the environment, and
 * on a machine without the production variables those are placeholders that
 * would break checkout. This updates only name, description and features, on
 * plans that already exist, matched by slug. Prices, Stripe IDs, trials and
 * whether a plan is active are left exactly as they are.
 *
 * Dry run by default: it prints the database it connected to and every change
 * it would make. Add --apply to write them.
 *
 *   npm run db:sync-plan-copy                       # local database, dry run
 *   DATABASE_URL="postgresql://..." npm run db:sync-plan-copy -- --apply
 */
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { examplePlans } from "./plans"

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
  console.log(apply ? "Mode: APPLY (writing changes)\n" : "Mode: dry run (add --apply to write)\n")

  let changes = 0
  for (const plan of examplePlans) {
    const row = await prisma.plan.findUnique({
      where: { slug: plan.slug },
      select: { id: true, name: true, description: true, features: true },
    })
    if (!row) {
      console.log(`- ${plan.slug}: not in this database, skipped (the seed creates plans; this only corrects copy)`)
      continue
    }
    const diffs: string[] = []
    if (row.name !== plan.name) diffs.push(`  name:        "${row.name}" → "${plan.name}"`)
    if (row.description !== plan.description) diffs.push(`  description: "${row.description}"\n            → "${plan.description}"`)
    if (JSON.stringify(row.features) !== JSON.stringify(plan.features)) {
      diffs.push(`  features:    ${JSON.stringify(row.features)}\n            → ${JSON.stringify(plan.features)}`)
    }
    if (diffs.length === 0) {
      console.log(`- ${plan.slug}: up to date`)
      continue
    }
    changes++
    console.log(`- ${plan.slug}:\n${diffs.join("\n")}`)
    if (apply) {
      await prisma.plan.update({
        where: { id: row.id },
        data: { name: plan.name, description: plan.description, features: plan.features },
      })
    }
  }

  console.log(`\n${changes} plan(s) ${apply ? "updated" : "would change"}.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
