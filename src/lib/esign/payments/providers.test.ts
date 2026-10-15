import { afterEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { platformFee } from "./types"
import { paystackSignAndPay, verifyPaystackSignature } from "./paystack"
import { startStripeOnboarding, stripeSignAndPay } from "./stripe"

const stripeApi = {
  retrieveDispute: vi.fn(),
  createAccountV2: vi.fn(),
  createAccountLink: vi.fn(),
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  listReversals: vi.fn(),
  createReversal: vi.fn(),
}
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: (...a: unknown[]) => stripeApi.createSession(...a), retrieve: (...a: unknown[]) => stripeApi.retrieveSession(...a) } },
    disputes: { retrieve: (...a: unknown[]) => stripeApi.retrieveDispute(...a) },
    v2: { core: { accounts: { create: (...a: unknown[]) => stripeApi.createAccountV2(...a) } } },
    accountLinks: { create: (...a: unknown[]) => stripeApi.createAccountLink(...a) },
    transfers: { listReversals: (...a: unknown[]) => stripeApi.listReversals(...a), createReversal: (...a: unknown[]) => stripeApi.createReversal(...a) },
  },
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("platformFee", () => {
  it("is zero unless configured, and rounds down", () => {
    expect(platformFee(1000, 0)).toBe(0)
    expect(platformFee(999, 150)).toBe(14)
    expect(platformFee(1000, 20_000)).toBe(1000)
  })
})

describe("verifyPaystackSignature", () => {
  it("accepts the HMAC-SHA512 of the raw body and rejects anything else", () => {
    const body = '{"event":"charge.success"}'
    const sig = createHmac("sha512", "sk_test").update(body).digest("hex")
    expect(verifyPaystackSignature(body, sig, "sk_test")).toBe(true)
    expect(verifyPaystackSignature(body + " ", sig, "sk_test")).toBe(false)
    expect(verifyPaystackSignature(body, null, "sk_test")).toBe(false)
  })
})

describe("paystack adapter", () => {
  it("initialises a transaction routed to the sender's subaccount", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test")
    vi.stubEnv("SIGN_AND_PAY_FEE_BPS", "100")
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", reference: "ref_1" } }))
    )
    vi.stubGlobal("fetch", fetchMock)

    const session = await paystackSignAndPay.createCheckout({
      paymentId: "pay_1",
      documentId: "doc_1",
      description: "NDA",
      amount: 10_000,
      currency: "GHS",
      payerEmail: "ama@example.com",
      payoutAccountId: "ACCT_123",
      reference: "ref_1",
      successUrl: "https://app/sign/t?payment=return",
      cancelUrl: "https://app/sign/t",
    })

    expect(session).toEqual({ url: "https://checkout.paystack.com/x", providerRef: "ref_1" })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toMatchObject({ subaccount: "ACCT_123", amount: 10_000, currency: "GHS", transaction_charge: 100 })
  })

  it("maps verification statuses", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test")
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, data: { status: "success", amount: 500, currency: "ghs" } })))
    )
    expect(await paystackSignAndPay.verify("ref_1")).toEqual({ status: "PAID", amount: 500, currency: "GHS" })
  })
})

/**
 * Stripe fee pass-through. On a destination charge Stripe takes its fee from
 * the platform; the adapter takes exactly that fee back from the sender's
 * transfer, once, and only for checkouts created under pass-through.
 */
describe("stripe adapter: processor fee pass-through", () => {
  const checkout = {
    paymentId: "pay_1",
    documentId: "doc_1",
    description: "NDA",
    amount: 10_000,
    currency: "USD",
    payerEmail: "ama@example.com",
    payoutAccountId: "acct_123",
    reference: "ref_1",
    successUrl: "https://app/sign/t?payment=return",
    cancelUrl: "https://app/sign/t",
  }
  const recover = () => stripeSignAndPay.recoverProcessorFee!({ providerRef: "cs_1", paymentId: "pay_1" })

  /** A paid 100.00 USD destination charge whose Stripe fee was 3.20. */
  const paidSession = (over: { metadata?: Record<string, string>; charge?: Record<string, unknown>; balance?: Record<string, unknown>; transfer?: Record<string, unknown> } = {}) => ({
    id: "cs_1",
    metadata: over.metadata ?? { kind: "sign_and_pay", processorFee: "sender" },
    payment_intent: {
      id: "pi_1",
      latest_charge: {
        id: "ch_1",
        status: "succeeded",
        currency: "usd",
        refunded: false,
        amount_refunded: 0,
        balance_transaction: { fee: 320, currency: "usd", exchange_rate: null, ...over.balance },
        transfer: { id: "tr_1", amount: 10_000, amount_reversed: 0, currency: "usd", ...over.transfer },
        ...over.charge,
      },
    },
  })

  afterEach(() => {
    for (const fn of Object.values(stripeApi)) fn.mockReset()
  })

  /**
   * The sender is the business of record (on_behalf_of), and nothing about
   * the money moves: same amount charged, same destination, same fee.
   */
  it("charges on behalf of the sender's connected account, with amount and fee unchanged", async () => {
    vi.stubEnv("SIGN_AND_PAY_FEE_BPS", "100")
    stripeApi.createSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" })
    const session = await stripeSignAndPay.createCheckout(checkout)
    expect(session).toEqual({ url: "https://checkout.stripe.com/c/cs_1", providerRef: "cs_1" })
    const params = stripeApi.createSession.mock.calls[0][0]
    expect(params.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 10_000 })
    expect(params.payment_intent_data).toMatchObject({
      on_behalf_of: "acct_123",
      transfer_data: { destination: "acct_123" },
      application_fee_amount: 100,
    })
  })

  it("tags new checkouts, and leaves what the signer pays and the sender is sent unchanged", async () => {
    stripeApi.createSession.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe.com/c/cs_1" })
    await stripeSignAndPay.createCheckout(checkout)
    const params = stripeApi.createSession.mock.calls[0][0]
    expect(params.metadata).toMatchObject({ processorFee: "sender" })
    expect(params.line_items[0].price_data.unit_amount).toBe(10_000)
    expect(params.payment_intent_data.transfer_data).toEqual({ destination: "acct_123" })
    // No markup: without SIGN_AND_PAY_FEE_BPS there is no application fee at all.
    expect(params.payment_intent_data.application_fee_amount).toBeUndefined()
  })

  it("reverses exactly Stripe's fee from the sender's transfer, labelled and idempotent", async () => {
    stripeApi.retrieveSession.mockResolvedValue(paidSession())
    stripeApi.listReversals.mockResolvedValue({ data: [] })
    stripeApi.createReversal.mockResolvedValue({ id: "trr_1", amount: 320, currency: "usd" })

    expect(await recover()).toEqual({ status: "recovered", amount: 320, currency: "usd" })
    const [transferId, params, options] = stripeApi.createReversal.mock.calls[0]
    expect(transferId).toBe("tr_1")
    expect(params).toMatchObject({ amount: 320, metadata: { kind: "processor_fee", salsoxPaymentId: "pay_1" } })
    expect(options).toEqual({ idempotencyKey: "salsox-fee-pay_1" })
  })

  it("does not take the fee twice", async () => {
    stripeApi.retrieveSession.mockResolvedValue(paidSession({ transfer: { amount_reversed: 320 } }))
    stripeApi.listReversals.mockResolvedValue({ data: [{ id: "trr_1", amount: 320, currency: "usd", metadata: { kind: "processor_fee" } }] })
    expect(await recover()).toEqual({ status: "recovered", amount: 320, currency: "usd" })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })

  it("leaves checkouts from before pass-through alone", async () => {
    stripeApi.retrieveSession.mockResolvedValue(paidSession({ metadata: { kind: "sign_and_pay" } }))
    expect(await recover()).toEqual({ status: "notApplicable" })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })

  it("waits while the charge or its fee is not final", async () => {
    stripeApi.retrieveSession.mockResolvedValue(paidSession({ charge: { status: "pending" } }))
    expect(await recover()).toEqual({ status: "pending" })
    stripeApi.retrieveSession.mockResolvedValue(paidSession({ charge: { balance_transaction: null } }))
    expect(await recover()).toEqual({ status: "pending" })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })

  it("takes nothing from a charge that has been refunded", async () => {
    stripeApi.retrieveSession.mockResolvedValue(paidSession({ charge: { refunded: true, amount_refunded: 10_000 } }))
    expect(await recover()).toEqual({ status: "notApplicable" })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })

  it("converts a fee settled in the platform's currency back at the charge's rate", async () => {
    stripeApi.retrieveSession.mockResolvedValue(
      paidSession({ charge: { currency: "eur" }, balance: { fee: 345, currency: "usd", exchange_rate: 1.085 }, transfer: { currency: "eur" } })
    )
    stripeApi.listReversals.mockResolvedValue({ data: [] })
    stripeApi.createReversal.mockResolvedValue({ id: "trr_1", amount: 318, currency: "eur" })
    await recover()
    expect(stripeApi.createReversal.mock.calls[0][1].amount).toBe(318)
  })

  it("reports instead of guessing when the fee cannot be stated in the transfer's currency", async () => {
    stripeApi.retrieveSession.mockResolvedValue(paidSession({ balance: { fee: 300, currency: "gbp", exchange_rate: null } }))
    stripeApi.listReversals.mockResolvedValue({ data: [] })
    expect(await recover()).toEqual({ status: "unconvertible", fee: 300, feeCurrency: "gbp" })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })
})

describe("paystack adapter: processor fee", () => {
  it("has the sender's subaccount bear Paystack's fee at settlement, so nothing is taken afterwards", async () => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test")
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, data: { authorization_url: "https://checkout.paystack.com/x", reference: "ref_1" } })))
    vi.stubGlobal("fetch", fetchMock)
    await paystackSignAndPay.createCheckout({
      paymentId: "pay_1",
      documentId: "doc_1",
      description: "NDA",
      amount: 10_000,
      currency: "GHS",
      payerEmail: "ama@example.com",
      payoutAccountId: "ACCT_123",
      reference: "ref_1",
      successUrl: "https://app/sign/t?payment=return",
      cancelUrl: "https://app/sign/t",
    })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.bearer).toBe("subaccount")
    // No markup: without SIGN_AND_PAY_FEE_BPS there is no platform charge.
    expect(body.transaction_charge).toBeUndefined()
    expect(paystackSignAndPay.recoverProcessorFee).toBeUndefined()
  })
})

describe("startStripeOnboarding", () => {
  const args = { email: "ama@example.com", country: "FR", returnUrl: "https://app/r", refreshUrl: "https://app/f" }

  afterEach(() => {
    for (const fn of Object.values(stripeApi)) fn.mockReset()
  })

  /**
   * Accounts v2, full dashboard, the sender's own country, and the sender
   * (through Stripe) holding fees and losses: the merchant-of-record model.
   * Pinned because flipping either responsibility back to the platform would
   * quietly move dispute losses onto Salsox.
   */
  it("creates a v2 full-dashboard account in the sender's country, on which Stripe collects fees and losses", async () => {
    stripeApi.createAccountV2.mockResolvedValue({ id: "acct_new" })
    stripeApi.createAccountLink.mockResolvedValue({ url: "https://connect.stripe.com/setup/x" })

    expect(await startStripeOnboarding(args)).toEqual({ url: "https://connect.stripe.com/setup/x", externalAccountId: "acct_new" })
    const params = stripeApi.createAccountV2.mock.calls[0][0]
    expect(params).toMatchObject({
      contact_email: "ama@example.com",
      dashboard: "full",
      identity: { country: "fr" },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
        recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
      },
      defaults: { responsibilities: { fees_collector: "stripe", losses_collector: "stripe" } },
    })
    expect(stripeApi.createAccountLink.mock.calls[0][0]).toMatchObject({ account: "acct_new", type: "account_onboarding" })
  })

  it("refuses to create an account without a supported country", async () => {
    await expect(startStripeOnboarding({ ...args, country: undefined })).rejects.toThrow(/country/)
    await expect(startStripeOnboarding({ ...args, country: "GH" })).rejects.toThrow(/country/)
    expect(stripeApi.createAccountV2).not.toHaveBeenCalled()
  })

  it("resumes an account already created instead of making another", async () => {
    stripeApi.createAccountLink.mockResolvedValue({ url: "https://connect.stripe.com/setup/y" })
    await startStripeOnboarding({ ...args, existingAccountId: "acct_old" })
    expect(stripeApi.createAccountV2).not.toHaveBeenCalled()
    expect(stripeApi.createAccountLink.mock.calls[0][0]).toMatchObject({ account: "acct_old" })
  })
})

/**
 * Chargeback recovery at Stripe: only a lost dispute, what the platform lost
 * capped at what the transfer still holds, once per dispute id.
 */
describe("stripe adapter: lost dispute recovery", () => {
  const recover = () => stripeSignAndPay.recoverLostDispute!({ disputeId: "dp_1", paymentId: "pay_1" })
  /** A lost dispute on a £100.00 payment: £100.00 withdrawn plus a £20.00 dispute fee. */
  const lostDispute = (over: { status?: string; transfer?: Record<string, unknown> | null } = {}) => ({
    id: "dp_1",
    status: over.status ?? "lost",
    balance_transactions: [{ net: -12_000, currency: "gbp" }],
    charge: {
      id: "ch_1",
      currency: "gbp",
      balance_transaction: { exchange_rate: null },
      transfer: over.transfer === null ? null : { id: "tr_1", amount: 10_000, amount_reversed: 335, currency: "gbp", ...over.transfer },
    },
  })

  afterEach(() => {
    for (const fn of Object.values(stripeApi)) fn.mockReset()
  })

  it("does nothing unless the dispute is lost", async () => {
    for (const status of ["won", "needs_response", "under_review", "warning_closed"]) {
      stripeApi.retrieveDispute.mockResolvedValue(lostDispute({ status }))
      expect(await recover()).toEqual({ status: "notLost" })
    }
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })

  it("reverses what the platform lost, capped at what is left of the transfer, keyed by the dispute id", async () => {
    stripeApi.retrieveDispute.mockResolvedValue(lostDispute())
    stripeApi.listReversals.mockResolvedValue({ data: [{ id: "trr_fee", amount: 335, currency: "gbp", metadata: { kind: "processor_fee" } }] })
    stripeApi.createReversal.mockResolvedValue({ id: "trr_dp", amount: 9_665, currency: "gbp" })

    expect(await recover()).toEqual({ status: "recovered", amount: 9_665, currency: "gbp", shortfall: 2_335, created: true })
    const [transferId, params, options] = stripeApi.createReversal.mock.calls[0]
    expect(transferId).toBe("tr_1")
    expect(params).toMatchObject({ amount: 9_665, metadata: { kind: "dispute_lost", disputeId: "dp_1", salsoxPaymentId: "pay_1" } })
    expect(options).toEqual({ idempotencyKey: "salsox-dispute-dp_1" })
  })

  it("does not reverse twice for the same dispute", async () => {
    stripeApi.retrieveDispute.mockResolvedValue(lostDispute())
    stripeApi.listReversals.mockResolvedValue({ data: [{ id: "trr_dp", amount: 9_665, currency: "gbp", metadata: { kind: "dispute_lost", disputeId: "dp_1", shortfall: "2335" } }] })
    expect(await recover()).toEqual({ status: "recovered", amount: 9_665, currency: "gbp", shortfall: 2_335, created: false })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })

  it("has nothing to recover from a transfer already fully reversed, or no transfer", async () => {
    stripeApi.retrieveDispute.mockResolvedValue(lostDispute({ transfer: { amount_reversed: 10_000 } }))
    stripeApi.listReversals.mockResolvedValue({ data: [] })
    expect(await recover()).toEqual({ status: "nothingToRecover" })
    stripeApi.retrieveDispute.mockResolvedValue(lostDispute({ transfer: null }))
    expect(await recover()).toEqual({ status: "nothingToRecover" })
    expect(stripeApi.createReversal).not.toHaveBeenCalled()
  })
})
