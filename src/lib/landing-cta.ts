/**
 * Where the landing page's calls to action lead.
 *
 * Both buttons used to point at the pricing section, so "Get started" and
 * "Send your first document" scrolled the visitor down to billing instead of
 * starting anything. A product's call to action starts the product: a visitor
 * without an account is sent to sign up, and someone already signed in goes
 * straight to uploading a document. The kit's own site (KIT_SITE="true") is
 * the exception: there the hero says "Start free" and pricing is where that
 * choice is made.
 *
 * Kept as a function so the rule is stated once and tested, instead of being
 * repeated as string literals in three components.
 */

export const SIGNUP_PATH = "/signup"
export const NEW_DOCUMENT_PATH = "/dashboard/documents/new"

/** The hero's primary button. */
export function heroCtaHref({ isKitSite, signedIn }: { isKitSite: boolean; signedIn: boolean }): string {
  if (isKitSite) return "#pricing"
  return signedIn ? NEW_DOCUMENT_PATH : SIGNUP_PATH
}

/** "Get started" in the navigation, which is only shown to signed-out visitors. */
export function getStartedHref(): string {
  return SIGNUP_PATH
}
