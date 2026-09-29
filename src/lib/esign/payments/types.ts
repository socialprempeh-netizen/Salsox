/**
 * The contract every Sign & Pay provider implements.
 *
 * Money always goes to the SENDER's own payout account (a Stripe Connect
 * account or a Paystack subaccount), never to the platform, except for an
 * optional platform fee (`SIGN_AND_PAY_FEE_BPS`, basis points). Adding a
 * provider means implementing this interface and registering it in
 * `./index.ts`; the signing flow never branches on the provider.
 */

export type CheckoutRequest = {
  /** Our Payment row id, echoed back in metadata for reconciliation. */
  paymentId: string
  documentId: string
  description: string
  amount: number // minor units
  currency: string // ISO 4217, upper case
  payerEmail: string
  /** acct_... (Stripe) or ACCT_... (Paystack) */
  payoutAccountId: string
  /** Paystack needs the reference up front; Stripe ignores this and returns its own. */
  reference: string
  successUrl: string
  cancelUrl: string
}

export type CheckoutSession = { url: string; providerRef: string }

export type VerifiedPayment = {
  status: "PAID" | "PENDING" | "FAILED"
  amount?: number
  currency?: string
}

export type PayoutOnboarding =
  | { kind: "redirect"; url: string; externalAccountId: string }
  | { kind: "ready"; externalAccountId: string }

export interface SignAndPayProvider {
  /** True when the platform's own API keys for this provider are configured. */
  isConfigured(): boolean
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>
  /** Asks the provider directly: webhooks can be late or spoofed, this cannot. */
  verify(providerRef: string): Promise<VerifiedPayment>
  /** Current readiness of a connected payout account. */
  isPayoutReady(externalAccountId: string): Promise<boolean>
}

/** Platform fee on a Sign & Pay amount, in minor units, rounded down. */
export function platformFee(amount: number, bps = Number(process.env.SIGN_AND_PAY_FEE_BPS ?? 0)): number {
  if (!Number.isFinite(bps) || bps <= 0) return 0
  return Math.floor((amount * Math.min(bps, 10_000)) / 10_000)
}
