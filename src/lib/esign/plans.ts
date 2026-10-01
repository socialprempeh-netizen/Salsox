/**
 * What each Salsox plan unlocks, as pure functions.
 *
 * The pricing page promised tiers that nothing enforced: every account,
 * paying or not, could use Sign & Pay, sequential signing and the sealed
 * certificate. This file is the one statement of who gets what; the engine
 * asks it before saving a setup, before sending and before sealing, and the
 * dashboard asks it to lock and upsell the same controls.
 *
 *   free      3 documents a month, Quick Send, WhatsApp/SMS links
 *   personal  unlimited documents (Personal, $9/mo)
 *   business  Sign & Pay, sequential signing and approvers, sealed PDFs with
 *             the audit certificate (Business, $19/mo, and Lifetime)
 *
 * Enterprise is sold by contact, not as a plan row: its extras (support,
 * invoicing, SLA) are commercial terms, so it has no tier of its own here and
 * its accounts run on the Business plan.
 *
 * No database here: callers pass the plan they loaded (see `senderPlan` in
 * sender.ts), which keeps every rule testable without one.
 */

export type PlanTier = "free" | "personal" | "business"

export type PlanFeature = "unlimitedDocuments" | "signAndPay" | "sequentialSigning" | "approvers" | "auditCertificate"

/** The lowest tier that includes each feature. */
export const FEATURE_TIER: Record<PlanFeature, PlanTier> = {
  unlimitedDocuments: "personal",
  signAndPay: "business",
  sequentialSigning: "business",
  approvers: "business",
  auditCertificate: "business",
}

const RANK: Record<PlanTier, number> = { free: 0, personal: 1, business: 2 }

/** Documents a free account may send per calendar month (UTC). */
export const FREE_DOCUMENTS_PER_MONTH = 3

export function hasFeature(tier: PlanTier, feature: PlanFeature): boolean {
  return RANK[tier] >= RANK[FEATURE_TIER[feature]]
}

/**
 * The tier a plan row grants, by slug. Personal is `starter-*`, Business is
 * `pro-*`, and Lifetime is sold as "Everything in Business". A paid plan this
 * does not recognise grants Personal: someone paying is never treated as
 * free, and nothing beyond what the cheapest plan sells is given away.
 */
export function tierForPlanSlug(slug: string): PlanTier {
  if (slug.startsWith("pro-") || slug === "lifetime") return "business"
  return "personal"
}

/**
 * The tier of a billing state, in the shape `getEntitlement` returns. A trial
 * and a past-due subscription still count: Stripe is still managing them, and
 * cutting features off mid-dunning would punish a card that is being retried.
 */
export function tierForEntitlement(
  entitlement:
    | { kind: "lifetime"; purchase: { plan: { slug: string } } }
    | { kind: "subscription"; subscription: { plan: { slug: string } } }
    | { kind: "free" }
): PlanTier {
  if (entitlement.kind === "lifetime") return tierForPlanSlug(entitlement.purchase.plan.slug)
  if (entitlement.kind === "subscription") return tierForPlanSlug(entitlement.subscription.plan.slug)
  return "free"
}

/**
 * The first gated feature a document setup uses that the tier lacks, or null
 * when the plan covers it all. Checked when a setup is saved and again when
 * the document is sent, since a plan can change in between.
 */
export function setupBlocker(
  tier: PlanTier,
  setup: { signingOrder: string; recipients: { role: string }[]; hasPayment: boolean }
): PlanFeature | null {
  if (setup.hasPayment && !hasFeature(tier, "signAndPay")) return "signAndPay"
  if (setup.signingOrder === "SEQUENTIAL" && !hasFeature(tier, "sequentialSigning")) return "sequentialSigning"
  if (setup.recipients.some((r) => r.role === "APPROVER") && !hasFeature(tier, "approvers")) return "approvers"
  return null
}

/** The first moment of the calendar month `now` falls in, in UTC. */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * Documents the tier may still send this month: null when unlimited,
 * otherwise what is left of the free allowance (never below zero).
 */
export function documentsLeft(tier: PlanTier, sentThisMonth: number): number | null {
  if (hasFeature(tier, "unlimitedDocuments")) return null
  return Math.max(0, FREE_DOCUMENTS_PER_MONTH - sentThisMonth)
}

/** The error code an action returns for a feature the plan lacks. */
export function planErrorCode(feature: PlanFeature): string {
  return `plan_${feature}`
}
