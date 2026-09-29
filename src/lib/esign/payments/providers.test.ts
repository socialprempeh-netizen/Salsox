import { afterEach, describe, expect, it, vi } from "vitest"
import { createHmac } from "node:crypto"
import { platformFee } from "./types"
import { paystackSignAndPay, verifyPaystackSignature } from "./paystack"

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
