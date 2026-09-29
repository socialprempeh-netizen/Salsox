/**
 * Stripe adapter for Sign & Pay, using Stripe Connect destination charges:
 * the signer pays on a Stripe Checkout page, the money settles to the sender's
 * connected Express account, and the platform keeps `platformFee()` if set.
 *
 * Reuses the kit's lazily-initialised client (src/lib/stripe.ts), so the same
 * STRIPE_SECRET_KEY powers subscriptions and Sign & Pay.
 */
import { stripe } from "@/lib/stripe"
import { platformFee, type CheckoutRequest, type SignAndPayProvider } from "./types"

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
      metadata: { salsoxPaymentId: req.paymentId, salsoxDocumentId: req.documentId, kind: "sign_and_pay" },
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
