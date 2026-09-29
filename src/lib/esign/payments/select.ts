/**
 * Sign & Pay: which provider collects a payment, and how amounts are shown.
 *
 * Paystack is used for the African currencies it settles natively (cards and
 * mobile money); Stripe for everything else. A sender can override the choice
 * per document, as long as they have a payout account on that provider.
 */
import type { PaymentProvider } from "@prisma/client"

/** Currencies Paystack settles (ISO 4217, upper case). */
export const PAYSTACK_CURRENCIES = ["GHS", "NGN", "KES", "ZAR", "XOF", "EGP", "RWF"] as const

/** Currencies offered in the Sign & Pay picker. */
export const SIGN_AND_PAY_CURRENCIES = ["USD", "EUR", "GBP", "GHS", "NGN", "KES", "ZAR"] as const

export function defaultProviderFor(currency: string): PaymentProvider {
  return (PAYSTACK_CURRENCIES as readonly string[]).includes(currency.toUpperCase()) ? "PAYSTACK" : "STRIPE"
}

/**
 * Picks the provider for a document: the requested one if the sender can be
 * paid out there, else the default for the currency if they can, else null
 * (Sign & Pay unavailable until they connect a payout account).
 */
export function chooseProvider(
  currency: string,
  readyProviders: PaymentProvider[],
  requested?: PaymentProvider | null
): PaymentProvider | null {
  if (requested && readyProviders.includes(requested)) return requested
  const preferred = defaultProviderFor(currency)
  if (readyProviders.includes(preferred)) return preferred
  return readyProviders[0] ?? null
}

/**
 * "12.50" → 1250. Parses a decimal amount typed by a person into minor units
 * without floating-point drift (12.29 * 100 is 1228.9999999999998).
 */
export function toMinorUnits(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const [whole, frac = ""] = trimmed.split(".")
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"))
}

export function formatMinorUnits(amount: number, currency: string, locale = "en"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
}
