/**
 * The rules behind prisma/set-live-stripe-prices.ts, which writes known Stripe
 * price IDs into `Plan.stripePriceId`, matched by slug, without calling
 * Stripe. That script exists for prices made by hand in the Stripe dashboard
 * (live mode, which prisma/create-stripe-prices.ts deliberately refuses).
 *
 * Checkout sends Stripe whatever the column holds, so a wrong value is a
 * broken Upgrade button or, worse, the wrong plan charged. Each assignment is
 * therefore checked before anything is written, and one failed check blocks
 * them all:
 *
 *   missing         no plan with that slug in this database
 *   wrongInterval   the plan bills on another interval than the price was
 *                   listed for (a yearly price on a monthly plan)
 *   invalidPriceId  not a Stripe price ID, a placeholder, or listed twice
 *   taken           another plan already holds the ID (the column is unique,
 *                   so the write would fail half-way otherwise)
 *
 * Pure: the script loads the rows and does the writing.
 */
import { isPlaceholderPriceId, type PlanInterval } from "./stripe-plan-prices"

/** A price ID to write, and the plan it belongs to. */
export type PriceAssignment = { slug: string; interval: PlanInterval; priceId: string }

/** The parts of a Plan row the checks read. */
export type PlanPriceRow = { slug: string; interval: PlanInterval; stripePriceId: string }

export type AssignmentResult =
  | { slug: string; action: "update"; from: string; to: string }
  | { slug: string; action: "unchanged"; to: string }
  | { slug: string; action: "missing"; to: string }
  | { slug: string; action: "wrongInterval"; to: string; expected: PlanInterval; actual: PlanInterval }
  | { slug: string; action: "invalidPriceId"; to: string }
  | { slug: string; action: "taken"; to: string; heldBy: string }

/** A Stripe price ID: `price_` and an alphanumeric id, never a placeholder. */
export function isStripePriceId(id: string): boolean {
  return /^price_[A-Za-z0-9]{8,}$/.test(id) && !isPlaceholderPriceId(id)
}

/** What writing each assignment would do to `rows`, in the assignments' order. */
export function planPriceAssignments(assignments: PriceAssignment[], rows: PlanPriceRow[]): AssignmentResult[] {
  const bySlug = new Map(rows.map((r) => [r.slug, r]))
  const holder = new Map(rows.map((r) => [r.stripePriceId, r.slug]))
  const listed = new Map<string, number>()
  for (const a of assignments) listed.set(a.priceId, (listed.get(a.priceId) ?? 0) + 1)

  return assignments.map((a): AssignmentResult => {
    const to = a.priceId
    if (!isStripePriceId(to) || (listed.get(to) ?? 0) > 1) return { slug: a.slug, action: "invalidPriceId", to }
    const row = bySlug.get(a.slug)
    if (!row) return { slug: a.slug, action: "missing", to }
    if (row.interval !== a.interval) return { slug: a.slug, action: "wrongInterval", to, expected: a.interval, actual: row.interval }
    if (row.stripePriceId === to) return { slug: a.slug, action: "unchanged", to }
    const heldBy = holder.get(to)
    if (heldBy && heldBy !== a.slug) return { slug: a.slug, action: "taken", to, heldBy }
    return { slug: a.slug, action: "update", from: row.stripePriceId, to }
  })
}

/** True when any result must stop the run before it writes anything. */
export function hasBlockingResult(results: AssignmentResult[]): boolean {
  return results.some((r) => r.action !== "update" && r.action !== "unchanged")
}

/** One line per result, for the script's output. */
export function describeAssignment(r: AssignmentResult): string {
  switch (r.action) {
    case "update":
      return `${r.slug}: ${r.from} -> ${r.to}`
    case "unchanged":
      return `${r.slug}: already ${r.to}, unchanged`
    case "missing":
      return `${r.slug}: BLOCKED, no plan with this slug in this database`
    case "wrongInterval":
      return `${r.slug}: BLOCKED, the plan bills ${r.actual} but ${r.to} was listed as ${r.expected}`
    case "invalidPriceId":
      return `${r.slug}: BLOCKED, ${r.to} is not a usable Stripe price ID (malformed, a placeholder, or listed twice)`
    case "taken":
      return `${r.slug}: BLOCKED, ${r.to} is already held by ${r.heldBy}`
  }
}
