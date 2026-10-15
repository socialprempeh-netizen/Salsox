/**
 * The countries a sender's Stripe account can be created in.
 *
 * Why this exists: Accounts v2 needs the account's country when it is
 * created, and it cannot be changed afterwards. The v1 accounts this
 * replaced silently took the platform's country, so a sender in France was
 * set up as a UK business. The Payouts page now asks, and this list is both
 * what the picker offers and what the server accepts: a value posted from
 * anywhere else is refused.
 *
 * Countries where Stripe accounts can be opened by any business (Stripe's
 * global availability, excluding invite-only and preview countries such as
 * India). Charges are made with `on_behalf_of` the sender, which is what lets
 * an account outside the platform's region receive them.
 *
 * Pure: the list and the checks are tested.
 */

export const STRIPE_CONNECT_COUNTRIES = [
  "AE", "AT", "AU", "BE", "BG", "BR", "CA", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GB", "GI", "GR", "HK", "HR", "HU", "IE", "IT", "JP", "LI", "LT", "LU", "LV", "MT", "MX", "MY",
  "NL", "NO", "NZ", "PL", "PT", "RO", "SE", "SG", "SI", "SK", "TH", "US",
] as const

export type StripeConnectCountry = (typeof STRIPE_CONNECT_COUNTRIES)[number]

/** True only for an exact, upper-case code from the list. */
export function isStripeConnectCountry(code: unknown): code is StripeConnectCountry {
  return typeof code === "string" && (STRIPE_CONNECT_COUNTRIES as readonly string[]).includes(code)
}

/**
 * The countries with display names in the reader's language, sorted by
 * name, for the picker. Names come from the platform (Intl.DisplayNames), so
 * no country name is stored in the message files.
 */
export function stripeCountryOptions(locale: string): { code: StripeConnectCountry; name: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" })
  return STRIPE_CONNECT_COUNTRIES.map((code) => ({ code, name: names.of(code) ?? code })).sort((a, b) =>
    a.name.localeCompare(b.name, locale)
  )
}
