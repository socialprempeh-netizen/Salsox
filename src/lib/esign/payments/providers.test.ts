import { afterEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { platformFee } from "./types"
import { paystackSignAndPay, verifyPaystackSignature } from "./paystack"
import { stripeSignAndPay } from "./stripe"

const stripeApi = {
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  listReversals: vi.fn(),
  createReversal: vi.fn(),
}
vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: (...a: unknown[]) => stripeApi.createSession(...a), retrieve: (...a: unknown[]) => stripeApi.retrieveSession(...a) } },
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
