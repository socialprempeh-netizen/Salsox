/**
 * The competitor prices the pricing section anchors against, and the pairing
 * of each with the Salsox plan it compares to. One statement of these figures
 * for the product's own pages, kept with the date they were read and where
 * from, because a price claim about another company has to be checkable.
 *
 * Only figures read from the company's own pricing page belong here. DocuSign
 * lists its eSignature plans on an annual term, billed monthly, per user; a
 * per-month figure is what it shows. SignNow is not here: its pricing page
 * did not load outside a browser session on the day of the check, and the
 * third-party figures found for it disagreed, so nothing could be cited.
 *
 * Update `checked` with the figures. The comparison page
 * (content/pages/compare/docusign.md) carries the same numbers in prose with
 * its own `checked` date; change both together.
 */

export type CompetitorPlan = {
  /** The plan's name as the company publishes it. */
  name: string
  /** List price in US cents per month, per user where `perUser`. */
  monthlyCents: number
  perUser: boolean
  /** How many envelopes the plan allows, and over what period. */
  envelopes: { count: number; per: "month" | "userYear" }
}

export const DOCUSIGN = {
  company: "DocuSign",
  source: "https://ecom.docusign.com/plans-and-pricing/esignature",
  checked: "2026-10-15",
  billing: "annual term, billed monthly",
  personal: { name: "Personal", monthlyCents: 1100, perUser: false, envelopes: { count: 5, per: "month" } },
  businessPro: { name: "Business Pro", monthlyCents: 4500, perUser: true, envelopes: { count: 100, per: "userYear" } },
} as const satisfies {
  company: string
  source: string
  checked: string
  billing: string
  personal: CompetitorPlan
  businessPro: CompetitorPlan
}

/** A Salsox plan as the pricing section has it: a Plan row's slug and price. */
export type OwnPlan = { slug: string; price: number; interval: string }

export type AnchorRow = {
  /** Which comparison this is: the entry paid plan, or the plan that collects payment. */
  tier: "entry" | "payments"
  ownMonthlyCents: number
  competitor: CompetitorPlan
}

/**
 * The like-for-like pairs, priced from the same Plan rows the cards render:
 * Personal against DocuSign Personal (each one's cheapest paid plan), and
 * Business against DocuSign Business Pro (the first plan on each side that
 * collects payment during signing). A pair whose plan is missing or inactive
 * is left out rather than shown with a made-up price.
 */
export function anchorRows(plans: OwnPlan[]): AnchorRow[] {
  const monthly = (slug: string) => plans.find((p) => p.slug === slug && p.interval === "MONTH")?.price
  const rows: AnchorRow[] = []
  const personal = monthly("starter-monthly")
  if (personal !== undefined) rows.push({ tier: "entry", ownMonthlyCents: personal, competitor: DOCUSIGN.personal })
  const business = monthly("pro-monthly")
  if (business !== undefined) rows.push({ tier: "payments", ownMonthlyCents: business, competitor: DOCUSIGN.businessPro })
  return rows
}

/** Whole dollars when the price is whole, as the plan cards show it. */
export function formatUsd(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}
