/**
 * The complaints the outreach agent acts on, and the one product fix each is
 * allowed to be answered with.
 *
 * A lead is kept only when its complaint maps to a fix here; anything else
 * ("their support was slow") is skipped rather than answered with a claim the
 * product cannot back. The writer (writer.ts) must name a fix id from the
 * catalogue the site adapter supplies, and the email may state only that
 * fix's facts, so what an email promises comes from one reviewed list.
 *
 * The catalogue's wording lives in the adapter (site.ts), not here: this file
 * defines the shape and the matching, which stay the same for any product.
 */

/** What a reviewer or poster is unhappy about. "other" is never contacted. */
export const COMPLAINTS = ["pricing", "limits", "signer-friction", "mobile", "payments", "complexity", "signing-order", "audit-trail", "other"] as const
export type Complaint = (typeof COMPLAINTS)[number]

/** One thing the product does about a complaint, in facts the email may repeat. */
export type Fix = {
  id: string
  /** The complaints this fix answers. */
  answers: Complaint[]
  /** A short name for the admin tab, e.g. "No signer accounts". */
  label: string
  /** The only product facts an email using this fix may state. */
  facts: string
}

/** The fix for a complaint: the first in catalogue order that answers it. */
export function fixFor(complaint: Complaint, catalogue: Fix[]): Fix | null {
  if (complaint === "other") return null
  return catalogue.find((fix) => fix.answers.includes(complaint)) ?? null
}

/** Complaints the catalogue can answer: the ones worth keeping a lead for. */
export function answerable(catalogue: Fix[]): Complaint[] {
  return COMPLAINTS.filter((c) => fixFor(c, catalogue) !== null)
}

export function isComplaint(value: string): value is Complaint {
  return (COMPLAINTS as readonly string[]).includes(value)
}
