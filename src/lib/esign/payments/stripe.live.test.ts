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
 * key is read from the environment only. Test-mode charges stay in the
 * Stripe test dashboard, labelled with the run's metadata.
 *
 * The sender's account: set STRIPE_E2E_ACCOUNT to a test Express account
 * whose sign-up a person has finished (Stripe's hosted sign-up shows a
 * CAPTCHA to a headless browser, so it cannot be automated), and the test
 * uses it as it is and leaves it in place. Without it, the test creates a
 * Custom account and deletes it at the end, which Stripe allows only when
 * the platform profile says the platform collects sender details.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import type Stripe from "stripe"

const key = process.env.STRIPE_SECRET_KEY ?? ""
const enabled = process.env.STRIPE_LIVE_TESTS === "1" && key.startsWith("sk_test_")

/**
 * Step one of a run against a fresh sender: STRIPE_E2E_ONBOARD=1 creates the
 * sender's account through the real `startStripeOnboarding`, reads back from
 * Stripe that it is a full-dashboard account whose fees and losses Stripe collects,
 * and writes its id and sign-up link to STRIPE_E2E_REPORT. A person finishes
 * the sign-up; the payments below then run with STRIPE_E2E_ACCOUNT set to it.
 */
describe.skipIf(!enabled || process.env.STRIPE_E2E_ONBOARD !== "1")("Sign & Pay sender onboarding on Stripe test mode", () => {
  it("creates the sender as Salsox does: v2, full dashboard, Stripe collects fees and losses", async () => {
    const { stripe } = await import("@/lib/stripe")
    const { startStripeOnboarding } = await import("./stripe")
    const { url, externalAccountId } = await startStripeOnboarding({
      email: "sender-e2e@example.com",
      country: "GB",
      returnUrl: "https://salsox.com/dashboard/payouts",
      refreshUrl: "https://salsox.com/dashboard/payouts",
    })
    const account = await stripe.v2.core.accounts.retrieve(externalAccountId, { include: ["defaults", "configuration.merchant", "configuration.recipient"] })
    const facts = { id: account.id, dashboard: account.dashboard, responsibilities: account.defaults?.responsibilities, url }
    if (process.env.STRIPE_E2E_REPORT) (await import("node:fs")).writeFileSync(process.env.STRIPE_E2E_REPORT, JSON.stringify(facts, null, 2))
    expect(account.dashboard).toBe("full")
    expect(account.defaults?.responsibilities).toMatchObject({ fees_collector: "stripe", losses_collector: "stripe" })
  }, 60_000)
})

/** Pays a Stripe Checkout page with the 4242 test card in a headless browser. */
async function payCheckout(url: string, card = "4242424242424242") {
  const { chromium } = await import("@playwright/test")
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.goto(url)
    // Where Stripe offers more than one method (in GBP: card, Pay by Bank,
    // Revolut Pay) the card form is folded behind a "Card" option. Wait for
    // whichever appears, rather than checking before the page has loaded.
    // The option's own button is a hidden overlay; the visible row is what
    // a person clicks.
    const cardRow = page.locator('[data-testid="card-accordion-item"]')
    await page.locator('#cardNumber, [data-testid="card-accordion-item"]').first().waitFor({ timeout: 30_000 })
    if (await cardRow.isVisible()) await cardRow.click()
    await page.locator("#cardNumber").fill(card)
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


// Skipped in onboarding mode: there is no finished sender to pay yet.
describe.skipIf(!enabled || process.env.STRIPE_E2E_ONBOARD === "1")("Sign & Pay on Stripe test mode (end to end)", () => {
  let stripe: Stripe
  let adapter: typeof import("./stripe").stripeSignAndPay
  let accountId: string
  const runId = `e2e-${Date.now()}`
  const report: Record<string, unknown>[] = []

  const existing = process.env.STRIPE_E2E_ACCOUNT?.trim()

  beforeAll(async () => {
    // A test key now defaults to direct charges (charge-mode.ts); this block
    // is about destination charges, so it asks for them.
    process.env.STRIPE_SIGN_AND_PAY_CHARGES = "destination"
    stripe = (await import("@/lib/stripe")).stripe
    adapter = (await import("./stripe")).stripeSignAndPay
    if (existing) {
      accountId = existing
      expect(await adapter.isPayoutReady(accountId)).toBe(true)
      return
    }
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
    // Vitest keeps a passing test's console quiet; STRIPE_E2E_REPORT names a
    // file to receive the balances instead.
    console.log(JSON.stringify(report, null, 2))
    if (process.env.STRIPE_E2E_REPORT) (await import("node:fs")).writeFileSync(process.env.STRIPE_E2E_REPORT, JSON.stringify(report, null, 2))
    // Only an account this run created is removed; one passed in is the
    // owner's, finished by hand, and is kept for the next run.
    if (accountId && !existing) await stripe.accounts.del(accountId).catch(() => {})
  })

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
    // Stripe's own processing fee charged to the sender's account, if any.
    // Pass-through takes Stripe's fee once, from the transfer; a Stripe fee
    // here as well would mean the sender paid it twice.
    const senderStripeFee = paymentBt.fee_details.filter((f) => f.type === "stripe_fee").reduce((sum, f) => sum + f.amount, 0)

    return {
      onBehalfOf: intent.on_behalf_of,
      transferDestination: transfer.destination,
      applicationFeeAmount: intent.application_fee_amount,
      signerPaid: { amount: charge.amount, currency: charge.currency },
      stripeFee: { amount: chargeBt.fee, currency: chargeBt.currency },
      feeReversals: reversals.map((r) => ({ amount: r.amount, currency: r.currency, kind: r.metadata?.kind })),
      // Every reversal, whatever its kind (processor fee, lost dispute).
      platformNet: { amount: platform, currency: chargeBt.currency },
      senderNet: { amount: sender, currency: paymentBt.currency },
      senderStripeFee,
    }
  }

  async function run(label: string, amount: number, currency: string, feeBps: string | undefined, card?: string) {
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
    await payCheckout(session.url, card)
    let verified = await adapter.verify(session.providerRef)
    for (let i = 0; i < 20 && verified.status !== "PAID"; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      verified = await adapter.verify(session.providerRef)
    }
    expect(verified).toMatchObject({ status: "PAID", amount, currency })

    const first = await adapter.recoverProcessorFee!({ providerRef: session.providerRef, paymentId })
    const second = await adapter.recoverProcessorFee!({ providerRef: session.providerRef, paymentId })
    const result = await balances(session.providerRef)
    report.push({ label, sessionId: session.providerRef, first, second, ...result })
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
    expect(result.senderStripeFee).toBe(0)
  }, 180_000)

  it("with a platform fee: taken as the application fee, and the platform nets exactly that", async () => {
    const { result } = await run("GBP, 1.5% platform fee", 10_000, "GBP", "150")
    expect(result.onBehalfOf).toBe(accountId)
    expect(result.applicationFeeAmount).toBe(150)
    expect(result.platformNet.amount).toBe(150)
    expect(result.senderNet.amount).toBe(10_000 - 150 - result.stripeFee.amount)
    expect(result.senderStripeFee).toBe(0)
  }, 180_000)

  it("a USD payment to a UK sender: the fee is converted at the charge's rate, the platform nets about zero", async () => {
    const { result } = await run("USD, no platform fee", 10_000, "USD", undefined)
    expect(result.onBehalfOf).toBe(accountId)
    expect(result.feeReversals).toHaveLength(1)
    // Within a minor unit or two of rounding across the conversion.
    expect(Math.abs(result.platformNet.amount)).toBeLessThanOrEqual(2)
    expect(result.senderStripeFee).toBe(0)
  }, 180_000)

  /**
   * Chargeback recovery against real Stripe: Stripe's dispute test card
   * (4000 0000 0000 0259) opens a fraud dispute as soon as it is paid;
   * closing it accepts the loss. Recovery then reverses what is left of the
   * sender's transfer, once however often it is asked.
   */
  it("a lost dispute: recovered from the sender's transfer once, the rest reported as shortfall", async () => {
    const { result } = await run("GBP, lost dispute", 10_000, "GBP", undefined, "4000000000000259")
    const session = await stripe.checkout.sessions.retrieve(report.at(-1)!.sessionId as string, { expand: ["payment_intent"] })
    const chargeId = (session.payment_intent as Stripe.PaymentIntent).latest_charge as string
    let disputeId: string | undefined
    for (let i = 0; i < 20 && !disputeId; i++) {
      disputeId = (await stripe.disputes.list({ charge: chargeId, limit: 1 })).data[0]?.id
      if (!disputeId) await new Promise((r) => setTimeout(r, 1500))
    }
    expect(disputeId).toBeDefined()
    // Not lost yet: nothing is taken.
    expect(await adapter.recoverLostDispute!({ disputeId: disputeId!, paymentId: "e2e" })).toEqual({ status: "notLost" })
    await stripe.disputes.close(disputeId!)

    const first = await adapter.recoverLostDispute!({ disputeId: disputeId!, paymentId: "e2e" })
    const second = await adapter.recoverLostDispute!({ disputeId: disputeId!, paymentId: "e2e" })
    const after = await balances(session.id)
    const dispute = await stripe.disputes.retrieve(disputeId!)
    const disputeNet = dispute.balance_transactions.reduce((sum, b) => sum + b.net, 0)
    report.push({ label: "GBP, lost dispute: after recovery", disputeStatus: dispute.status, disputeNet, first, second, ...after })

    expect(first).toMatchObject({ status: "recovered", created: true })
    expect(second).toMatchObject({ status: "recovered", created: false, amount: (first as { amount: number }).amount })
    // Everything left of the transfer came back: the processor fee earlier, the rest now.
    expect(after.feeReversals.reduce((sum, r) => sum + r.amount, 0)).toBe(10_000)
    expect(after.senderNet.amount).toBe(0)
    // What the platform still carries is the dispute fee, the shortfall.
    expect((first as { shortfall: number }).shortfall).toBe(-disputeNet - (10_000 - result.stripeFee.amount))
  }, 240_000)
})

/**
 * Direct charges (charge-mode.ts), the switch that took Sign & Pay off
 * destination charges: the checkout is made on the sender's own account, so
 * the charge, Stripe's fee, a refund and a dispute are all the sender's, and
 * the platform's share arrives as an application fee. Nothing carries
 * on_behalf_of or a transfer any more: the sender is the merchant outright.
 *
 * Needs STRIPE_E2E_DIRECT_ACCOUNT: a sender account as createSenderAccount
 * makes them (full dashboard, its own fees, Stripe collecting its losses),
 * with its sign-up finished by hand. It is used as it is and kept.
 */
const directAccount = process.env.STRIPE_E2E_DIRECT_ACCOUNT?.trim()

describe.skipIf(!enabled || !directAccount || process.env.STRIPE_E2E_ONBOARD === "1")("Sign & Pay direct charges on Stripe test mode (end to end)", () => {
  let stripe: Stripe
  let adapter: typeof import("./stripe").stripeSignAndPay
  const runId = `e2e-direct-${Date.now()}`
  const report: Record<string, unknown>[] = []
  const onSender = () => ({ stripeAccount: directAccount! })

  beforeAll(async () => {
    process.env.STRIPE_SIGN_AND_PAY_CHARGES = "direct"
    stripe = (await import("@/lib/stripe")).stripe
    adapter = (await import("./stripe")).stripeSignAndPay
    expect(await adapter.isPayoutReady(directAccount!)).toBe(true)
  }, 60_000)

  afterAll(async () => {
    if (process.env.STRIPE_E2E_DIRECT_REPORT) (await import("node:fs")).writeFileSync(process.env.STRIPE_E2E_DIRECT_REPORT, JSON.stringify(report, null, 2))
  })

  /** A checkout made by the real createCheckout, paid in a browser, confirmed by verify. */
  async function pay(label: string, amount: number, currency: string, feeBps: string | undefined, card?: string) {
    if (feeBps === undefined) delete process.env.SIGN_AND_PAY_FEE_BPS
    else process.env.SIGN_AND_PAY_FEE_BPS = feeBps
    const paymentId = `${runId}-${label.replace(/\W+/g, "-")}`
    const session = await adapter.createCheckout({
      paymentId,
      documentId: runId,
      description: `Sign & Pay direct e2e (${label})`,
      amount,
      currency,
      payerEmail: "signer-e2e@example.com",
      payoutAccountId: directAccount!,
      reference: paymentId,
      successUrl: "https://example.com/paid",
      cancelUrl: "https://example.com/cancelled",
    })
    // The reference records the account, so later calls act on it.
    expect(session.providerRef.startsWith(`direct:${directAccount}:cs_test_`)).toBe(true)
    await payCheckout(session.url, card)
    let verified = await adapter.verify(session.providerRef)
    for (let i = 0; i < 20 && verified.status !== "PAID"; i++) {
      await new Promise((r) => setTimeout(r, 1500))
      verified = await adapter.verify(session.providerRef)
    }
    expect(verified).toMatchObject({ status: "PAID", amount, currency })
    return { providerRef: session.providerRef, sessionId: session.providerRef.split(":").at(-1)!, paymentId }
  }

  /** Where the money and the fees landed, read from Stripe on both sides. */
  async function facts(sessionId: string) {
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge.balance_transaction"] }, onSender())
    const intent = session.payment_intent as Stripe.PaymentIntent
    const charge = intent.latest_charge as Stripe.Charge
    const bt = charge.balance_transaction as Stripe.BalanceTransaction
    // The platform cannot see the charge at all: it is not the platform's.
    const onPlatform = await stripe.charges.retrieve(charge.id).then(
      () => true,
      () => false
    )
    const feeId = typeof charge.application_fee === "string" ? charge.application_fee : charge.application_fee?.id
    const appFee = feeId ? await stripe.applicationFees.retrieve(feeId) : null
    const stripeFee = bt.fee_details.filter((f) => f.type === "stripe_fee").reduce((sum, f) => sum + f.amount, 0)
    return {
      chargeId: charge.id,
      onBehalfOf: intent.on_behalf_of,
      transferData: intent.transfer_data,
      applicationFeeAmount: intent.application_fee_amount,
      chargeOnPlatform: onPlatform,
      senderStripeFee: stripeFee,
      senderNet: bt.net,
      applicationFee: appFee ? { amount: appFee.amount, refunded: appFee.amount_refunded, account: typeof appFee.account === "string" ? appFee.account : appFee.account.id } : null,
      refunded: charge.amount_refunded,
    }
  }

  it("no platform fee: the charge and Stripe's fee are the sender's, and the platform takes nothing", async () => {
    const paid = await pay("GBP, no platform fee", 10_000, "GBP", undefined)
    const result = await facts(paid.sessionId)
    report.push({ label: "no platform fee", ...result })
    expect(result.onBehalfOf).toBeNull()
    expect(result.transferData).toBeNull()
    expect(result.applicationFeeAmount).toBeNull()
    expect(result.applicationFee).toBeNull()
    expect(result.chargeOnPlatform).toBe(false)
    // Stripe charged its fee to the sender's account, so there is nothing to pass through.
    expect(result.senderStripeFee).toBeGreaterThan(0)
    expect(result.senderNet).toBe(10_000 - result.senderStripeFee)
    expect(await adapter.recoverProcessorFee!({ providerRef: paid.providerRef, paymentId: paid.paymentId })).toEqual({ status: "notApplicable" })
  }, 180_000)

  it("with a platform fee: an application fee is all the platform receives, and a refund returns it", async () => {
    const paid = await pay("GBP, 1.5% platform fee", 10_000, "GBP", "150")
    const result = await facts(paid.sessionId)
    report.push({ label: "1.5% platform fee", ...result })
    expect(result.onBehalfOf).toBeNull()
    expect(result.applicationFeeAmount).toBe(150)
    expect(result.applicationFee).toMatchObject({ amount: 150, refunded: 0, account: directAccount })
    expect(result.senderNet).toBe(10_000 - 150 - result.senderStripeFee)

    // The refund is made on the sender's account and gives the platform's fee back.
    const first = await adapter.refund!({ providerRef: paid.providerRef, paymentId: paid.paymentId })
    const second = await adapter.refund!({ providerRef: paid.providerRef, paymentId: paid.paymentId })
    const after = await facts(paid.sessionId)
    report.push({ label: "1.5% platform fee, refunded", first, second, ...after })
    expect(after.refunded).toBe(10_000)
    expect(after.applicationFee).toMatchObject({ amount: 150, refunded: 150 })
    // Asked twice, refunded once.
    expect(second.refundId === first.refundId || second.refundId.startsWith("already:")).toBe(true)
  }, 180_000)

  /**
   * The reason for the switch: Stripe's dispute test card opens a dispute as
   * soon as it is paid. On a direct charge the dispute, and its loss, are on
   * the sender's account; the platform has no dispute to carry.
   */
  it("a lost dispute is debited from the sender's account, not the platform's", async () => {
    const paid = await pay("GBP, lost dispute", 10_000, "GBP", undefined, "4000000000000259")
    const { chargeId } = await facts(paid.sessionId)
    let dispute: Stripe.Dispute | undefined
    for (let i = 0; i < 20 && !dispute; i++) {
      dispute = (await stripe.disputes.list({ charge: chargeId, limit: 1 }, onSender())).data[0]
      if (!dispute) await new Promise((r) => setTimeout(r, 1500))
    }
    expect(dispute).toBeDefined()
    await stripe.disputes.close(dispute!.id, undefined, onSender())
    const closed = await stripe.disputes.retrieve(dispute!.id, undefined, onSender())
    const senderLoss = closed.balance_transactions.reduce((sum, b) => sum + b.net, 0)
    const platformDisputes = await stripe.disputes.list({ limit: 100, created: { gte: Math.floor(Date.now() / 1000) - 3600 } })
    report.push({ label: "lost dispute", status: closed.status, senderLoss, platformDisputesForCharge: platformDisputes.data.filter((d) => d.charge === chargeId).length })
    expect(closed.status).toBe("lost")
    // The amount and Stripe's dispute fee, both from the sender's balance.
    expect(senderLoss).toBeLessThan(-10_000)
    expect(platformDisputes.data.filter((d) => d.charge === chargeId)).toHaveLength(0)
  }, 240_000)
})
