/**
 * Sign & Pay reconciliation against a real database, with a fake provider.
 *
 * The unit tests pin each decision; these check what lands in the tables
 * when requests race, which a mocked Prisma cannot show:
 *
 * - two "Pay" taps at once open one checkout and one payment row;
 * - a payment that lands after its document was cancelled is refunded once
 *   and recorded once, even when two confirmations race;
 * - a checkout nobody finished is closed by the sweep once it is abandoned;
 * - a dispute delivered twice is recorded once;
 * - the processor fee is passed on once per paid payment, never for a
 *   refunded one, and the sweep retries it within its window;
 * - the sender is emailed about a lost dispute's recovery only when it
 *   actually took the money, not again on a retried delivery.
 *
 * Opt-in, like finalize-concurrency.db.test.ts: run with ESIGN_DB_TESTS=1
 * against the local database. Rows are removed with their user at the end.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { config } from "dotenv"

const enabled = process.env.ESIGN_DB_TESTS === "1"

// A fake provider the tests steer: what verify answers, and what it was asked.
const fake = vi.hoisted(() => ({
  verifyStatus: "PENDING" as "PAID" | "PENDING" | "FAILED",
  checkouts: 0,
  refunds: 0,
  cancels: 0,
  feeCalls: [] as string[],
  feeStatus: "recovered" as "recovered" | "pending",
  disputeCreated: true,
}))
vi.mock("./index", () => {
  const provider = {
    isConfigured: () => true,
    createCheckout: async (req: { reference: string }) => {
      fake.checkouts++
      // Slow on purpose: the window a second tap used to slip through.
      await new Promise((r) => setTimeout(r, 150))
      return { url: `https://pay.example/${req.reference}`, providerRef: req.reference }
    },
    verify: async () => ({ status: fake.verifyStatus, amount: 1250, currency: "USD" }),
    isPayoutReady: async () => true,
    cancelCheckout: async () => {
      fake.cancels++
      return true
    },
    refund: async ({ paymentId }: { paymentId: string }) => {
      fake.refunds++
      return { refundId: `re_${paymentId}` }
    },
    recoverLostDispute: async () => ({ status: "recovered" as const, amount: 1250, currency: "usd", shortfall: 0, created: fake.disputeCreated }),
    recoverProcessorFee: async ({ paymentId }: { paymentId: string }) => {
      fake.feeCalls.push(paymentId)
      return fake.feeStatus === "recovered" ? { status: "recovered" as const, amount: 66, currency: "usd" } : { status: "pending" as const }
    },
  }
  return { getProvider: () => provider, configuredProviders: () => ["STRIPE"] }
})
// The emails read translations through next-intl, which only runs inside Next.
const sent = vi.hoisted(() => ({ refunds: [] as string[], disputes: [] as string[], recovered: [] as string[] }))
vi.mock("../emails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../emails")>()),
  sendPaymentRefunded: async (a: { to: string }) => (sent.refunds.push(a.to), "sent" as const),
  sendPaymentDisputed: async (a: { to: string }) => (sent.disputes.push(a.to), "sent" as const),
  sendDisputeRecovered: async (a: { to: string }) => (sent.recovered.push(a.to), "sent" as const),
  sendSigningInvite: async () => "sent" as const,
  sendDocumentCompleted: async () => "sent" as const,
}))

describe.skipIf(!enabled)("Sign & Pay reconciliation (database)", () => {
  type Modules = {
    prisma: typeof import("@/lib/prisma").prisma
    signing: typeof import("../signing")
    settle: typeof import("./settle")
    reconcile: typeof import("./reconcile")
  }
  let m: Modules
  let userId: string

  beforeAll(async () => {
    config({ path: ".env.local" })
    config({ path: ".env" })
    m = {
      prisma: (await import("@/lib/prisma")).prisma,
      signing: await import("../signing"),
      settle: await import("./settle"),
      reconcile: await import("./reconcile"),
    }
    const user = await m.prisma.user.create({ data: { name: "Pay Test", email: `pay-${randomUUID()}@example.com`, emailVerified: true } })
    userId = user.id
    await m.prisma.payoutAccount.create({ data: { userId, provider: "STRIPE", externalAccountId: "acct_test", ready: true } })
  })

  afterAll(async () => {
    if (!m) return
    await m.prisma.document.deleteMany({ where: { userId } })
    await m.prisma.user.delete({ where: { id: userId } })
    await m.prisma.$disconnect()
  })

  beforeEach(() => {
    fake.verifyStatus = "PENDING"
    fake.checkouts = 0
    fake.refunds = 0
    fake.cancels = 0
    fake.feeCalls.length = 0
    fake.feeStatus = "recovered"
    sent.refunds.length = 0
    sent.disputes.length = 0
    sent.recovered.length = 0
    fake.disputeCreated = true
  })

  /** A pending Sign & Pay document with one payer, and the payer's token. */
  async function payable() {
    const token = randomUUID().replace(/-/g, "")
    const doc = await m.prisma.document.create({
      data: {
        userId,
        title: "Invoice",
        status: "PENDING",
        originalKey: `documents/${userId}/${randomUUID()}/original.pdf`,
        originalSha256: "0".repeat(64),
        pageCount: 1,
        sentAt: new Date(),
        paymentAmount: 1250,
        paymentCurrency: "USD",
        paymentProvider: "STRIPE",
        recipients: { create: [{ email: "payer@example.com", name: "Payer", token, mustPay: true }] },
      },
      include: { recipients: true },
    })
    return { doc, token, recipientId: doc.recipients[0].id }
  }

  it("opens one checkout when the payer taps Pay twice at once", async () => {
    const { doc, token } = await payable()
    const [a, b] = await Promise.all([m.signing.startPayment(token), m.signing.startPayment(token)])

    expect(fake.checkouts).toBe(1)
    expect(await m.prisma.payment.count({ where: { documentId: doc.id } })).toBe(1)
    // The second tap is either sent to the same checkout or asked to wait.
    const outcomes = [a, b].map((r) => (r.ok ? r.url : r.error))
    expect(outcomes.filter((o) => o.startsWith("https://pay.example/"))).not.toHaveLength(0)
    expect(outcomes.every((o) => o.startsWith("https://pay.example/") || o === "paymentInProgress")).toBe(true)
  })

  it("refunds once a payment that lands after the document was cancelled", async () => {
    const { doc, token } = await payable()
    const started = await m.signing.startPayment(token)
    expect(started.ok).toBe(true)
    const payment = await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })
    await m.prisma.document.update({ where: { id: doc.id }, data: { status: "CANCELLED" } })
    fake.verifyStatus = "PAID"

    await Promise.all([m.signing.confirmPayment(payment.id), m.signing.confirmPayment(payment.id)])

    const after = await m.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })
    expect(after.status).toBe("REFUNDED")
    expect(await m.prisma.auditEvent.count({ where: { documentId: doc.id, type: "PAYMENT_REFUNDED" } })).toBe(1)
    // Owner and payer are each told once.
    expect(sent.refunds.sort()).toEqual(["payer@example.com", (await m.prisma.user.findUniqueOrThrow({ where: { id: userId } })).email].sort())
  })

  it("closes an open checkout when its document is cancelled", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    await m.settle.closeOpenCheckouts(doc.id)
    expect(fake.cancels).toBe(1)
    expect((await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })).status).toBe("FAILED")
  })

  it("closes a checkout nobody finished once it is abandoned", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    // Two days and a bit ago.
    await m.prisma.payment.updateMany({ where: { documentId: doc.id }, data: { createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000) } })
    await m.reconcile.reconcilePayments(new Date(), { documentId: doc.id })
    expect((await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })).status).toBe("FAILED")
  })

  it("records a dispute delivered twice only once, and alerts the sender once", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    const payment = await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })
    const opened = { find: { id: payment.id }, disputeId: "dp_1", stage: "opened" as const, amount: 1250 }
    await m.settle.recordDispute(opened)
    await m.settle.recordDispute(opened)
    expect(await m.prisma.auditEvent.count({ where: { documentId: doc.id, type: "PAYMENT_DISPUTED" } })).toBe(1)
    expect(sent.disputes).toHaveLength(1)

    await m.settle.recordDispute({ ...opened, stage: "closed", outcome: "lost" })
    expect((await m.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("REFUNDED")
  })
  it("passes the processor fee on once when a payment is confirmed, even when confirmations race", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    const payment = await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })
    fake.verifyStatus = "PAID"
    await Promise.all([m.signing.confirmPayment(payment.id), m.signing.confirmPayment(payment.id)])
    expect((await m.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe("PAID")
    expect(fake.feeCalls).toEqual([payment.id])
  })

  it("never passes a fee on for a payment that is refunded instead of kept", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    const payment = await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })
    await m.prisma.document.update({ where: { id: doc.id }, data: { status: "CANCELLED" } })
    fake.verifyStatus = "PAID"
    await m.signing.confirmPayment(payment.id)
    await m.reconcile.recoverProcessorFees(new Date(), { documentId: doc.id })
    expect(fake.feeCalls).toEqual([])
  })

  it("retries a fee that was not final at confirmation, within the sweep's window only", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    const payment = await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })
    fake.verifyStatus = "PAID"
    fake.feeStatus = "pending"
    await m.signing.confirmPayment(payment.id)
    fake.feeStatus = "recovered"
    expect(await m.reconcile.recoverProcessorFees(new Date(), { documentId: doc.id })).toBe(1)
    expect(fake.feeCalls).toEqual([payment.id, payment.id])

    // Paid more than a week ago: out of the sweep's reach.
    await m.prisma.payment.update({ where: { id: payment.id }, data: { paidAt: new Date(Date.now() - m.reconcile.FEE_SWEEP_WINDOW_MS - 60_000) } })
    expect(await m.reconcile.recoverProcessorFees(new Date(), { documentId: doc.id })).toBe(0)
    expect(fake.feeCalls).toHaveLength(2)
  })

  it("emails the sender once when a lost dispute is recovered, not again on a retried delivery", async () => {
    const { doc, token } = await payable()
    await m.signing.startPayment(token)
    const payment = await m.prisma.payment.findFirstOrThrow({ where: { documentId: doc.id } })
    await m.settle.recoverLostDispute({ find: { id: payment.id }, disputeId: "dp_1" })
    expect(sent.recovered).toHaveLength(1)

    // The provider reports the recovery as already made: no second email.
    fake.disputeCreated = false
    await m.settle.recoverLostDispute({ find: { id: payment.id }, disputeId: "dp_1" })
    expect(sent.recovered).toHaveLength(1)
  })
})
