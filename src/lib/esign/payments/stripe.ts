/**
 * DIRECT CHARGES (charge-mode.ts): new checkouts can now be made on the
 * sender's own Stripe account instead, with Salsox's share as an
 * application fee. Stripe then debits the sender's account, not Salsox's,
 * for disputes and for its processing fee, which is what stops Salsox
 * absorbing signers' chargebacks; the fee pass-through and the lost-dispute
 * recovery below have nothing to do for such a checkout. Direct is the
 * default in Stripe test mode; live keeps the destination flow described
 * next until STRIPE_SIGN_AND_PAY_CHARGES=direct is set.
 *
 * Stripe adapter for Sign & Pay, using Stripe Connect destination charges:
 * the signer pays on a Stripe Checkout page, the money settles to the sender's
 * connected account (a full Stripe account since Accounts v2; Express
 * before), and the platform keeps `platformFee()` if set.
 *
 * Stripe takes its processing fee from the platform on destination charges.
 * It is passed on to the sender at cost once the payment succeeds
 * (`recoverProcessorFee`, rules in fee-passthrough.ts): read from the
 * charge's balance transaction, reversed from the sender's transfer. Until
 * then the platform paid it on every payment.
 *
 * Reuses the kit's lazily-initialised client (src/lib/stripe.ts), so the same
 * STRIPE_SECRET_KEY powers subscriptions and Sign & Pay.
 *
 * `on_behalf_of` makes the sender the business of record for the signer's
 * payment: their statement descriptor on the signer's card statement, their
 * country for settlement and for the Stripe fee schedule (still billed to
 * the platform), their payment method settings. What it does NOT change,
 * per Stripe (docs.stripe.com/connect/charges, "Disputes and chargebacks"):
 * a dispute on a destination charge debits the platform's balance "with or
 * without on_behalf_of". The sender's account holding its own losses
 * (createSenderAccount below) does not change that either. So a LOST
 * dispute's cost is taken back from the sender's transfer afterwards
 * (`recoverLostDispute`, rules in dispute-recovery.ts); what exceeds the
 * transfer, the dispute fee above all, stays with the platform.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { processorFeeToRecover } from "./fee-passthrough"
import { disputeLoss, lostDisputeRecovery } from "./dispute-recovery"
import { isStripeConnectCountry, type StripeConnectCountry } from "./stripe-countries"
import { chargeMode, decodeCheckoutRef, encodeCheckoutRef, onAccount } from "./charge-mode"
import { platformFee, type CheckoutRequest, type DisputeRecovery, type FeeRecovery, type SignAndPayProvider } from "./types"

/**
 * Marks a checkout whose Stripe fee the sender bears. Only checkouts created
 * with it get the fee passed on, so payments made before pass-through, under
 * the terms the sender had then, are never touched.
 */
const FEE_TAG = { key: "processorFee", value: "sender" } as const
/** Metadata `kind` of the transfer reversal that takes the fee back. */
const FEE_REVERSAL_KIND = "processor_fee"
/** Metadata `kind` of the transfer reversal that takes a lost dispute's cost back. */
const DISPUTE_REVERSAL_KIND = "dispute_lost"

export const stripeSignAndPay: SignAndPayProvider = {
  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY)
  },

  async createCheckout(req: CheckoutRequest) {
    const fee = platformFee(req.amount)
    if (chargeMode() === "direct") {
      // On the sender's own account: the charge, its Stripe fee and any
      // dispute are theirs; Salsox's share arrives as an application fee.
      // No on_behalf_of or transfer_data: there is nothing to transfer.
      const session = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          customer_email: req.payerEmail,
          line_items: [{ quantity: 1, price_data: { currency: req.currency.toLowerCase(), unit_amount: req.amount, product_data: { name: req.description } } }],
          payment_intent_data: {
            ...(fee > 0 ? { application_fee_amount: fee } : {}),
            metadata: { salsoxPaymentId: req.paymentId, salsoxDocumentId: req.documentId },
          },
          // No processorFee tag: the sender's account pays Stripe directly.
          metadata: { salsoxPaymentId: req.paymentId, salsoxDocumentId: req.documentId, kind: "sign_and_pay", charge: "direct" },
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
        },
        { stripeAccount: req.payoutAccountId }
      )
      if (!session.url) throw new Error("Stripe returned a Checkout session without a URL")
      return { url: session.url, providerRef: encodeCheckoutRef({ mode: "direct", account: req.payoutAccountId, sessionId: session.id }) }
    }
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
        // The sender is the business of record (see the header). Amounts are
        // untouched: the signer pays `amount`, the sender receives it less
        // the platform fee, exactly as before.
        on_behalf_of: req.payoutAccountId,
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
    // Was retrieve(providerRef): a direct checkout lives on the sender's account.
    const ref = decodeCheckoutRef(providerRef)
    const session = await stripe.checkout.sessions.retrieve(ref.sessionId, undefined, onAccount(ref))
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
    const ref = decodeCheckoutRef(providerRef)
    const session = await stripe.checkout.sessions.retrieve(ref.sessionId, undefined, onAccount(ref))
    if (session.status !== "open") return session.status === "expired"
    await stripe.checkout.sessions.expire(ref.sessionId, undefined, onAccount(ref))
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
    // A direct charge's Stripe fee was taken from the sender's account already.
    if (decodeCheckoutRef(providerRef).mode === "direct") return { status: "notApplicable" }
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

  /**
   * Chargeback recovery (rules in dispute-recovery.ts): on a LOST dispute,
   * reverse from the sender's transfer what the platform lost, as Stripe's
   * own balance transactions for the dispute state it.
   *
   * Idempotent per dispute: a reversal labelled with this dispute's id is
   * found and reported instead of repeated, and the reversal is created with
   * the dispute id as its idempotency key, so a webhook delivered twice, or
   * retried after a failure, cannot reverse twice.
   */
  async recoverLostDispute({ disputeId, paymentId }): Promise<DisputeRecovery> {
    const dispute = await stripe.disputes.retrieve(disputeId, { expand: ["charge.balance_transaction", "charge.transfer"] })
    if (dispute.status !== "lost") return { status: "notLost" }
    const charge = dispute.charge as Stripe.Charge
    const transfer = charge.transfer as Stripe.Transfer | null
    if (!transfer) return { status: "nothingToRecover" }

    const reversals = await stripe.transfers.listReversals(transfer.id, { limit: 100 })
    const done = reversals.data.find((r) => r.metadata?.kind === DISPUTE_REVERSAL_KIND && r.metadata?.disputeId === disputeId)
    if (done) {
      return { status: "recovered", amount: done.amount, currency: done.currency, shortfall: Number(done.metadata?.shortfall ?? 0), created: false }
    }

    const lossTransactions = dispute.balance_transactions
    const loss = disputeLoss(lossTransactions)
    const lossCurrency = lossTransactions[0]?.currency ?? charge.currency
    const chargeBalance = charge.balance_transaction as Stripe.BalanceTransaction | null
    const plan = lostDisputeRecovery({
      loss,
      lossCurrency,
      exchangeRate: chargeBalance?.exchange_rate ?? null,
      chargeCurrency: charge.currency,
      transferCurrency: transfer.currency,
      transferAmount: transfer.amount,
      transferReversed: transfer.amount_reversed,
    })
    if (plan === null) return { status: "unconvertible", loss, lossCurrency }
    if (plan.amount === 0) return { status: "nothingToRecover" }

    const reversal = await stripe.transfers.createReversal(
      transfer.id,
      {
        amount: plan.amount,
        description: "Lost payment dispute (chargeback): amount and dispute fee recovered",
        metadata: { kind: DISPUTE_REVERSAL_KIND, disputeId, salsoxPaymentId: paymentId, loss: String(loss), lossCurrency, shortfall: String(plan.shortfall) },
      },
      { idempotencyKey: `salsox-dispute-${disputeId}` }
    )
    return { status: "recovered", amount: reversal.amount, currency: reversal.currency, shortfall: plan.shortfall, created: true }
  },

  async refund({ providerRef, paymentId }) {
    const ref = decodeCheckoutRef(providerRef)
    const session = await stripe.checkout.sessions.retrieve(ref.sessionId, undefined, onAccount(ref))
    const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id
    if (!paymentIntent) throw new Error(`Checkout ${providerRef} has no payment to refund`)
    if (ref.mode === "direct") {
      try {
        // On the sender's account, from their balance; Salsox's application fee goes back too.
        const refund = await stripe.refunds.create(
          { payment_intent: paymentIntent, refund_application_fee: true, metadata: { salsoxPaymentId: paymentId } },
          { stripeAccount: ref.account, idempotencyKey: `salsox-refund-${paymentId}` }
        )
        return { refundId: refund.id }
      } catch (error) {
        if ((error as { code?: string }).code === "charge_already_refunded") return { refundId: `already:${paymentIntent}` }
        throw error
      }
    }
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

/**
 * The sender's Stripe account, as Accounts v2 creates it: a full Stripe
 * account the sender owns and logs into, with card payments (`merchant`) and
 * incoming transfers (`recipient`, which destination charges need), and
 * Stripe, not Salsox, collecting the account's fees and losses. That makes
 * the sender responsible for their own negative balance, matching the
 * merchant-of-record choice (on_behalf_of above).
 *
 * Why the full dashboard: on Stripe's stable API version an Express account
 * whose fees and losses Stripe collects is refused ("This account
 * configuration is not supported"); only a preview version accepts it. The
 * full dashboard is the stable way to make the sender liable.
 *
 * Why v2: Stripe no longer lets new Connect platforms create accounts with
 * POST /v1/accounts (only a test-mode policy re-enables it), and Salsox uses
 * nothing that still requires v1. A v2 account's id works with every v1
 * endpoint used here (account links, accounts.retrieve, Checkout's
 * transfer_data and on_behalf_of, transfer reversals), answered in v1 shape.
 * v2 also needs the country up front, and it cannot be changed later: the
 * sender picks it on the Payouts page (stripe-countries.ts).
 */
function createSenderAccount(email: string, country: StripeConnectCountry) {
  return stripe.v2.core.accounts.create({
    contact_email: email,
    dashboard: "full",
    identity: { country: country.toLowerCase() },
    configuration: {
      merchant: { capabilities: { card_payments: { requested: true } } },
      recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
    },
    defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    metadata: { createdBy: "salsox-sign-and-pay" },
  })
}

/**
 * Creates the sender's Stripe account (or resumes the one already created)
 * and returns the onboarding link. A new account needs its country; an
 * existing one keeps the country it was created with.
 */
export async function startStripeOnboarding(args: {
  email: string
  existingAccountId?: string | null
  /** Required for a new account: it cannot be changed once created. */
  country?: string | null
  returnUrl: string
  refreshUrl: string
}): Promise<{ url: string; externalAccountId: string }> {
  // Was a v1 Express account, which Stripe now refuses for a new platform
  // in live mode, and on which the platform carried the account's losses:
  //   await stripe.accounts.create({
  //     type: "express",
  //     email: args.email,
  //     capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  //   })
  let accountId = args.existingAccountId
  if (!accountId) {
    if (!isStripeConnectCountry(args.country)) throw new Error("A Stripe account needs a supported country")
    accountId = (await createSenderAccount(args.email, args.country)).id
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    return_url: args.returnUrl,
    refresh_url: args.refreshUrl,
  })
  return { url: link.url, externalAccountId: accountId }
}
