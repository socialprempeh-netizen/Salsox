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

export const GUIDE_PATH = "/docs/getting-started"

/**
 * The secondary "demo" links: the hero's second button and the footer's last
 * product link. Both pointed at /login whenever no demo deployment was
 * configured, so "Live demo" opened a sign-in form, which demonstrates
 * nothing. With NEXT_PUBLIC_DEMO_URL set they lead there, as before; without
 * it the hero offers the walkthrough guide and the footer the free plan,
 * both real places. `label` is a key in the `hero` and `footer` messages.
 */
export function heroSecondaryCta(demoUrl: string | null): { href: string; label: "liveDemo" | "howItWorks" } {
  return demoUrl ? { href: demoUrl, label: "liveDemo" } : { href: GUIDE_PATH, label: "howItWorks" }
}

export function footerTryLink(demoUrl: string | null): { href: string; label: "demo" | "tryFree" } {
  return demoUrl ? { href: demoUrl, label: "demo" } : { href: SIGNUP_PATH, label: "tryFree" }
}
