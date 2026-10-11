/**
 * Sign & Pay on Stripe, end to end, against a real Stripe TEST account.
 *
 * The unit tests pin what the adapter asks Stripe for. This shows what
 * Stripe then does with the money: a checkout created by the real
 * `createCheckout`, paid in a real browser with Stripe's 4242 test card,
 * confirmed by `verify` and settled by `recoverProcessorFee`, then read back
 * from both balances. It checks the three things the money model rests on:
 *
 * - the charge is made on behalf of the sender's connected account;
 * - a platform fee, when one is configured, is taken as the application fee;
 * - the rest settles to the sender, and Stripe's own fee comes out of the
 *   sender's share (pass-through at cost), so the platform nets exactly its
 *   platform fee: zero when none is set.
 *
 * Opt-in, like the database tests: it needs STRIPE_LIVE_TESTS=1 and a
 * STRIPE_SECRET_KEY that starts with sk_test_ (a live key is refused). The
 * key is read from the environment only. It creates one connected test
 * account per run and deletes it at the end; test-mode charges stay in the
 * Stripe test dashboard, labelled with the run's metadata.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY ?? ""
const enabled = process.env.STRIPE_LIVE_TESTS === "1" && key.startsWith("sk_test_")

describe.skipIf(!enabled)("Sign & Pay on Stripe test mode (end to end)", () => {
  let stripe: Stripe
  let adapter: typeof import("./stripe").stripeSignAndPay
  let accountId: string
  const runId = `e2e-${Date.now()}`
  const report: Record<string, unknown>[] = []

  beforeAll(async () => {
    stripe = (await import("@/lib/stripe")).stripe
    adapter = (await import("./stripe")).stripeSignAndPay
    // A UK sender, the platform's own region, onboarded with Stripe's test
    // data so it can take charges at once. Custom rather than Express: Express
    // onboarding is a hosted form; transfers and reversals behave the same.
    const account = await stripe.accounts.create({
      type: "custom",
      country: "GB",
      email: "sender-e2e@example.com",
      business_type: "individual",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { mcc: "7372", url: "https://salsox.com" },
      individual: {
        first_name: "Test",
        last_name: "Sender",
        email: "sender-e2e@example.com",
        phone: "+442071838750",
        dob: { day: 1, month: 1, year: 1901 },
        address: { line1: "address_full_match", city: "London", postal_code: "EC1A 1BB", country: "GB" },
      },
      external_account: { object: "bank_account", country: "GB", currency: "gbp", routing_number: "108800", account_number: "00012345" },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: "8.8.8.8" },
      metadata: { purpose: "salsox-sign-and-pay-e2e", runId },
    })
    accountId = account.id
    for (let i = 0; i < 20 && !(await adapter.isPayoutReady(accountId)); i++) await new Promise((r) => setTimeout(r, 1500))
    expect(await adapter.isPayoutReady(accountId)).toBe(true)
  }, 60_000)

  afterAll(async () => {
    console.log(JSON.stringify(report, null, 2))
    if (accountId) await stripe.accounts.del(accountId).catch(() => {})
  })

  /** Pays a Stripe Checkout page with the 4242 test card in a headless browser. */
  async function payInBrowser(url: string) {
    const { chromium } = await import("@playwright/test")
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage()
      await page.goto(url)
      const cardTab = page.locator('[data-testid="card-accordion-item-button"]')
      if (await cardTab.isVisible().catch(() => false)) await cardTab.click()
      await page.locator("#cardNumber").fill("4242424242424242")
      await page.locator("#cardExpiry").fill("12 / 34")
      await page.locator("#cardCvc").fill("123")
      await page.locator("#billingName").fill("Test Signer")
      const postal = page.locator("#billingPostalCode")
      if (await postal.isVisible().catch(() => false)) await postal.fill("EC1A 1BB")
      await page.locator('[data-testid="hosted-payment-submit-button"], button[type="submit"]').first().click()
      await page.waitForURL(/example\.com/, { timeout: 60_000 })
    } finally {
      await browser.close()
    }
  }

  /** What each side ended with, read from their balance transactions. */
  async function balances(sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] })
    const intent = session.payment_intent as Stripe.PaymentIntent
    const charge = await stripe.charges.retrieve((intent.latest_charge as Stripe.Charge).id, {
      expand: ["balance_transaction", "transfer.balance_transaction", "transfer.reversals.data.balance_transaction", "application_fee.balance_transaction"],
    })
    const transfer = charge.transfer as Stripe.Transfer
    const chargeBt = charge.balance_transaction as Stripe.BalanceTransaction
    const reversals = transfer.reversals.data
    const appFee = charge.application_fee as Stripe.ApplicationFee | null

    // Platform: the charge net of Stripe's fee, minus what it sent the sender,
    // plus what came back (fee reversal, application fee).
    const platform =
      chargeBt.net +
      (transfer.balance_transaction as Stripe.BalanceTransaction).amount +
      reversals.reduce((sum, r) => sum + (r.balance_transaction as Stripe.BalanceTransaction).amount, 0) +
      (appFee ? (appFee.balance_transaction as Stripe.BalanceTransaction).net : 0)

    // Sender: the payment as it landed on the connected account (net of any
    // application fee), minus the reversals as they landed there.
    const payment = await stripe.charges.retrieve(transfer.destination_payment as string, { expand: ["balance_transaction"] }, { stripeAccount: accountId })
    const paymentBt = payment.balance_transaction as Stripe.BalanceTransaction
    let reversedOnSender = 0
    for (const r of reversals) {
      const refund = await stripe.refunds.retrieve(r.destination_payment_refund as string, { expand: ["balance_transaction"] }, { stripeAccount: accountId })
      reversedOnSender += (refund.balance_transaction as Stripe.BalanceTransaction).amount
    }
    const sender = paymentBt.net + reversedOnSender

    return {
      onBehalfOf: intent.on_behalf_of,
      transferDestination: transfer.destination,
      applicationFeeAmount: intent.application_fee_amount,
      signerPaid: { amount: charge.amount, currency: charge.currency },
      stripeFee: { amount: chargeBt.fee, currency: chargeBt.currency },
      feeReversals: reversals.map((r) => ({ amount: r.amount, currency: r.currency, kind: r.metadata?.kind })),
      platformNet: { amount: platform, currency: chargeBt.currency },
      senderNet: { amount: sender, currency: paymentBt.currency },
    }
  }

  async function run(label: string, amount: number, currency: string, feeBps: string | undefined) {
    if (feeBps === undefined) delete process.env.SIGN_AND_PAY_FEE_BPS
    else process.env.SIGN_AND_PAY_FEE_BPS = feeBps
    const paymentId = `${runId}-${label}`
    const session = await adapter.createCheckout({
      paymentId,
      documentId: runId,
      description: `Sign & Pay e2e (${label})`,
      amount,
      currency,
      payerEmail: "signer-e2e@example.com",
      payoutAccountId: accountId,
      reference: paymentId,
      successUrl: "https://example.com/paid",
      cancelUrl: "https://example.com/cancelled",
    })
    await payInBrowser(session.url)
    let verified = await adapter.verify(session.providerRef)
    for (let i = 0; i < 20 && verified.status !== "PAID"; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      verified = await adapter.verify(session.providerRef)
    }
    expect(verified).toMatchObject({ status: "PAID", amount, currency })

    const first = await adapter.recoverProcessorFee!({ providerRef: session.providerRef, paymentId })
    const second = await adapter.recoverProcessorFee!({ providerRef: session.providerRef, paymentId })
    const result = await balances(session.providerRef)
    report.push({ label, first, second, ...result })
    return { first, second, result }
  }

  it("no platform fee (production): sender bears exactly Stripe's fee, platform nets zero", async () => {
    const { first, second, result } = await run("GBP, no platform fee", 10_000, "GBP", undefined)
    expect(result.onBehalfOf).toBe(accountId)
    expect(result.transferDestination).toBe(accountId)
    expect(result.applicationFeeAmount).toBeNull()
    expect(first.status).toBe("recovered")
    // Asked twice, taken once.
    expect(second).toEqual(first)
    expect(result.feeReversals).toEqual([{ amount: result.stripeFee.amount, currency: "gbp", kind: "processor_fee" }])
    expect(result.platformNet.amount).toBe(0)
    expect(result.senderNet.amount).toBe(10_000 - result.stripeFee.amount)
  }, 180_000)

  it("with a platform fee: taken as the application fee, and the platform nets exactly that", async () => {
    const { result } = await run("GBP, 1.5% platform fee", 10_000, "GBP", "150")
    expect(result.onBehalfOf).toBe(accountId)
    expect(result.applicationFeeAmount).toBe(150)
    expect(result.platformNet.amount).toBe(150)
    expect(result.senderNet.amount).toBe(10_000 - 150 - result.stripeFee.amount)
  }, 180_000)

  it("a USD payment to a UK sender: the fee is converted at the charge's rate, the platform nets about zero", async () => {
    const { result } = await run("USD, no platform fee", 10_000, "USD", undefined)
    expect(result.onBehalfOf).toBe(accountId)
    expect(result.feeReversals).toHaveLength(1)
    // Within a minor unit or two of rounding across the conversion.
    expect(Math.abs(result.platformNet.amount)).toBeLessThanOrEqual(2)
  }, 180_000)
})
