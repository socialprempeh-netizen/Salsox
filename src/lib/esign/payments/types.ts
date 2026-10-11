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

/**
 * The outcome of passing a payment's processor fee on to the sender
 * (src/lib/esign/payments/fee-passthrough.ts).
 * - recovered: taken from the sender's proceeds (now, or by an earlier run).
 * - pending: the charge or its fee is not final yet; try again later.
 * - notApplicable: nothing to take (a checkout from before pass-through,
 *   a refunded charge).
 * - unconvertible: the fee could not be stated in the transfer's currency
 *   without guessing, so the platform kept it; reported, not retried.
 */
export type FeeRecovery =
  | { status: "recovered"; amount: number; currency: string }
  | { status: "pending" }
  | { status: "notApplicable" }
  | { status: "unconvertible"; fee: number; feeCurrency: string }

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
  /**
   * Makes an unfinished checkout impossible to pay, when the provider allows
   * it. Returns false when it cannot (Paystack has no such call): a payment
   * that still lands is then refunded by reconciliation.
   */
  cancelCheckout(providerRef: string): Promise<boolean>
  /**
   * Gives a payment back in full. Safe to call again for the same payment:
   * a payment already refunded counts as done, not as an error.
   */
  refund(args: { providerRef: string; paymentId: string }): Promise<{ refundId: string }>
  /**
   * Takes the processor's real fee on a paid payment from the sender's
   * proceeds, when the provider charged it to the platform. Safe to call
   * again: a fee already taken is reported as recovered, not taken twice.
   * Absent for providers whose fee the sender already bears at settlement
   * (Paystack, through `bearer: "subaccount"`).
   */
  recoverProcessorFee?(args: { providerRef: string; paymentId: string }): Promise<FeeRecovery>
}

/** Platform fee on a Sign & Pay amount, in minor units, rounded down. */
export function platformFee(amount: number, bps = Number(process.env.SIGN_AND_PAY_FEE_BPS ?? 0)): number {
  if (!Number.isFinite(bps) || bps <= 0) return 0
  return Math.floor((amount * Math.min(bps, 10_000)) / 10_000)
}
