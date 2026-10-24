/**
 * Which kind of Stripe charge Sign & Pay makes, and how a checkout records
 * the account it lives on. Pure, tested in charge-mode.test.ts.
 *
 * Why there are two: Sign & Pay began with destination charges (the charge
 * is the platform's, the money is transferred to the sender, `on_behalf_of`
 * makes the sender the business of record). Stripe debits a dispute on a
 * destination charge from the PLATFORM, with or without on_behalf_of, so
 * Salsox carried every chargeback and could only claw back what was left of
 * the sender's transfer afterwards (dispute-recovery.ts), never the dispute
 * fee on a full payment. A DIRECT charge is made on the sender's own Stripe
 * account: Stripe debits its disputes, its processing fee and any negative
 * balance from that account (the sender's accounts have Stripe as fees and
 * losses collector, see createSenderAccount), and Salsox takes its share as
 * an application fee. That is the switch that stops Salsox absorbing
 * signers' chargebacks.
 *
 * Rollout: direct charges are the default in Stripe TEST mode only. Live
 * keeps destination charges until STRIPE_SIGN_AND_PAY_CHARGES=direct is set
 * on purpose, after the direct flow has been checked end to end in test
 * mode and the Connect webhook endpoint exists (direct charges' events are
 * sent to Connect endpoints). STRIPE_SIGN_AND_PAY_CHARGES=destination keeps
 * the old flow anywhere.
 *
 * A direct checkout's reference carries its account ("direct:acct:cs"),
 * because every later call (verify, cancel, refund) must be made on that
 * account; a plain session id is a destination checkout, as every checkout
 * made before this change is.
 */

export type ChargeMode = "direct" | "destination"

type Env = Record<string, string | undefined>

export function chargeMode(env: Env = process.env): ChargeMode {
  const chosen = env.STRIPE_SIGN_AND_PAY_CHARGES?.trim().toLowerCase()
  if (chosen === "direct" || chosen === "destination") return chosen
  return env.STRIPE_SECRET_KEY?.trim().startsWith("sk_test_") ? "direct" : "destination"
}

export type CheckoutRef = { mode: "direct"; account: string; sessionId: string } | { mode: "destination"; sessionId: string }

export function encodeCheckoutRef(ref: CheckoutRef): string {
  return ref.mode === "direct" ? `direct:${ref.account}:${ref.sessionId}` : ref.sessionId
}

export function decodeCheckoutRef(providerRef: string): CheckoutRef {
  const match = /^direct:([^:]+):(.+)$/.exec(providerRef)
  return match ? { mode: "direct", account: match[1], sessionId: match[2] } : { mode: "destination", sessionId: providerRef }
}

/** The request options that make a Stripe call act on the sender's account, for a direct checkout. */
export function onAccount(ref: CheckoutRef): { stripeAccount: string } | undefined {
  return ref.mode === "direct" ? { stripeAccount: ref.account } : undefined
}
