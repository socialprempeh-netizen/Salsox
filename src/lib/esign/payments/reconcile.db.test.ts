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
 * - a dispute delivered twice is recorded once.
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
  }
  return { getProvider: () => provider, configuredProviders: () => ["STRIPE"] }
})
// The emails read translations through next-intl, which only runs inside Next.
const sent = vi.hoisted(() => ({ refunds: [] as string[], disputes: [] as string[] }))
vi.mock("../emails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../emails")>()),
  sendPaymentRefunded: async (a: { to: string }) => (sent.refunds.push(a.to), "sent" as const),
  sendPaymentDisputed: async (a: { to: string }) => (sent.disputes.push(a.to), "sent" as const),
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
    sent.refunds.length = 0
    sent.disputes.length = 0
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
})
