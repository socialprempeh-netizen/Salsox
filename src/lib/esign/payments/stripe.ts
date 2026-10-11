/**
 * Stripe adapter for Sign & Pay, using Stripe Connect destination charges:
 * the signer pays on a Stripe Checkout page, the money settles to the sender's
 * connected Express account, and the platform keeps `platformFee()` if set.
 *
 * Stripe takes its processing fee from the platform on destination charges.
 * It is passed on to the sender at cost once the payment succeeds
 * (`recoverProcessorFee`, rules in fee-passthrough.ts): read from the
 * charge's balance transaction, reversed from the sender's transfer. Until
 * then the platform paid it on every payment.
 *
 * Reuses the kit's lazily-initialised client (src/lib/stripe.ts), so the same
 * STRIPE_SECRET_KEY powers subscriptions and Sign & Pay.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { processorFeeToRecover } from "./fee-passthrough"
import { platformFee, type CheckoutRequest, type FeeRecovery, type SignAndPayProvider } from "./types"

/**
 * Marks a checkout whose Stripe fee the sender bears. Only checkouts created
 * with it get the fee passed on, so payments made before pass-through, under
 * the terms the sender had then, are never touched.
 */
const FEE_TAG = { key: "processorFee", value: "sender" } as const
/** Metadata `kind` of the transfer reversal that takes the fee back. */
const FEE_REVERSAL_KIND = "processor_fee"

export const stripeSignAndPay: SignAndPayProvider = {
  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY)
  },

  async createCheckout(req: CheckoutRequest) {
    const fee = platformFee(req.amount)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: req.payerEmail,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: req.currency.toLowerCase(),
            unit_amount: req.amount,
            product_data: { name: req.description },
          },
        },
      ],
      payment_intent_data: {
        transfer_data: { destination: req.payoutAccountId },
        ...(fee > 0 ? { application_fee_amount: fee } : {}),
        metadata: { salsoxPaymentId: req.paymentId, salsoxDocumentId: req.documentId },
      },
      // Tagged so the kit's subscription webhook handler can tell these
      // sessions apart from plan checkouts and hand them over.
      // `processorFee: "sender"`: Stripe's fee on this payment is passed on
      // to the sender after it succeeds (recoverProcessorFee below).
      metadata: { salsoxPaymentId: req.paymentId, salsoxDocumentId: req.documentId, kind: "sign_and_pay", [FEE_TAG.key]: FEE_TAG.value },
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
    })
    if (!session.url) throw new Error("Stripe returned a Checkout session without a URL")
    return { url: session.url, providerRef: session.id }
  },

  async verify(providerRef: string) {
    const session = await stripe.checkout.sessions.retrieve(providerRef)
    const status = session.payment_status === "paid" ? "PAID" : session.status === "expired" ? "FAILED" : "PENDING"
    return {
      status,
      amount: session.amount_total ?? undefined,
      currency: session.currency?.toUpperCase(),
    }
  },

  async isPayoutReady(externalAccountId: string) {
    const account = await stripe.accounts.retrieve(externalAccountId)
    return Boolean(account.charges_enabled)
  },

  async cancelCheckout(providerRef: string) {
    const session = await stripe.checkout.sessions.retrieve(providerRef)
    if (session.status !== "open") return session.status === "expired"
    await stripe.checkout.sessions.expire(providerRef)
    return true
  },

  /**
   * Pass-through at cost: Stripe charged its fee to the platform, so the same
   * amount is reversed from the transfer to the sender, labelled, once.
   *
   * The fee is Stripe's own figure from the charge's balance transaction
   * (fee includes any tax Stripe adds on it), read after the charge has
   * succeeded, so it is the real fee for that card, country and currency,
   * not an estimate. Idempotent twice over: an existing reversal of this
   * kind is found and reported instead of repeated, and the reversal is
   * created with an idempotency key.
   */
  async recoverProcessorFee({ providerRef, paymentId }): Promise<FeeRecovery> {
    const session = await stripe.checkout.sessions.retrieve(providerRef, {
      expand: ["payment_intent.latest_charge.balance_transaction", "payment_intent.latest_charge.transfer"],
    })
    if (session.metadata?.[FEE_TAG.key] !== FEE_TAG.value) return { status: "notApplicable" }
    const intent = session.payment_intent as Stripe.PaymentIntent | null
    const charge = intent?.latest_charge as Stripe.Charge | null | undefined
    if (!charge || charge.status !== "succeeded") return { status: "pending" }
    // Refunded at all (from the Stripe dashboard, say): the sender has
    // already given money back, and how the fee falls is that refund's call.
    if (charge.refunded || charge.amount_refunded > 0) return { status: "notApplicable" }
    const balance = charge.balance_transaction as Stripe.BalanceTransaction | null
    const transfer = charge.transfer as Stripe.Transfer | null
    if (!balance || !transfer) return { status: "pending" }

    const reversals = await stripe.transfers.listReversals(transfer.id, { limit: 100 })
    const done = reversals.data.find((r) => r.metadata?.kind === FEE_REVERSAL_KIND)
    if (done) return { status: "recovered", amount: done.amount, currency: done.currency }

    const amount = processorFeeToRecover({
      fee: balance.fee,
      feeCurrency: balance.currency,
      exchangeRate: balance.exchange_rate,
      chargeCurrency: charge.currency,
      transferCurrency: transfer.currency,
      transferAmount: transfer.amount,
      transferReversed: transfer.amount_reversed,
    })
    if (amount === null) return { status: "unconvertible", fee: balance.fee, feeCurrency: balance.currency }
    if (amount === 0) return { status: "recovered", amount: 0, currency: transfer.currency }

    const reversal = await stripe.transfers.createReversal(
      transfer.id,
      {
        amount,
        description: "Payment processing fee (Stripe), passed through at cost",
        metadata: { kind: FEE_REVERSAL_KIND, salsoxPaymentId: paymentId, stripeFee: String(balance.fee), stripeFeeCurrency: balance.currency },
      },
      { idempotencyKey: `salsox-fee-${paymentId}` }
    )
    return { status: "recovered", amount: reversal.amount, currency: reversal.currency }
  },

  async refund({ providerRef, paymentId }) {
    const session = await stripe.checkout.sessions.retrieve(providerRef)
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
    if (!paymentIntent) throw new Error(`Checkout ${providerRef} has no payment to refund`)
    try {
      const refund = await stripe.refunds.create(
        {
          payment_intent: paymentIntent,
          // Destination charge: the money sits with the sender's connected
          // account. Pull it back from them, and return our fee too, so the
          // refund costs neither the payer nor the platform.
          reverse_transfer: true,
          refund_application_fee: true,
          metadata: { salsoxPaymentId: paymentId },
        },
        // One refund per payment, however many times reconciliation retries.
        { idempotencyKey: `salsox-refund-${paymentId}` }
      )
      return { refundId: refund.id }
    } catch (error) {
      // Refunded already (by us or from the Stripe dashboard): done.
      if ((error as { code?: string }).code === "charge_already_refunded") return { refundId: `already:${paymentIntent}` }
      throw error
    }
  },
}

/** Creates an Express account for a sender and returns the onboarding link. */
export async function startStripeOnboarding(args: {
  email: string
  existingAccountId?: string | null
  returnUrl: string
  refreshUrl: string
}): Promise<{ url: string; externalAccountId: string }> {
  const accountId =
    args.existingAccountId ??
    (
      await stripe.accounts.create({
        type: "express",
        email: args.email,
        capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      })
    ).id
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: args.returnUrl,
    refresh_url: args.refreshUrl,
  })
  return { url: link.url, externalAccountId: accountId }
}
