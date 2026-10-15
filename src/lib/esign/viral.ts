/**
 * The "Signed via {site}" links: the signup link shown to signers once
 * they finish (on the signing page) and at the foot of the completed-document
 * email, which carries the audit trail.
 *
 * Signers are the product's best audience: they have just used it, on their
 * own phone, without an account. Each link is tagged with UTM parameters, so
 * a signup that starts here is attributed to it (src/lib/seo/attribution.ts
 * reads them into the first-touch cookie) and lands on Quick Send after
 * signup, the shortest path to sending a first document.
 *
 * One function for both placements, so the tagging cannot drift between them.
 */
import { SIGNUP_TO_FIRST_DOCUMENT_PATH } from "@/lib/landing-cta"

export type SignedViaSource = "signing_page" | "completed_email"

export const SIGNED_VIA_CAMPAIGN = "signed_via"

/** The tagged signup link; `base` makes it absolute, which an email needs. */
export function signedViaHref(source: SignedViaSource, base = ""): string {
  // The medium is where the link sat: an email link is counted as email
  // traffic, the signing page as a referral from the product itself.
  const medium = source === "completed_email" ? "email" : "referral"
  const params = new URLSearchParams({ utm_source: source, utm_medium: medium, utm_campaign: SIGNED_VIA_CAMPAIGN })
  const separator = SIGNUP_TO_FIRST_DOCUMENT_PATH.includes("?") ? "&" : "?"
  return `${base}${SIGNUP_TO_FIRST_DOCUMENT_PATH}${separator}${params}`
}
