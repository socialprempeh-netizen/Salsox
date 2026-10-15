/**
 * The operational counts behind the overview's alerts and the Support &
 * System Health page, queried in one place so the two always agree.
 *
 * Definitions, since each is a judgement:
 * - stuck payment: a Sign & Pay payment still PENDING after the abandon window
 *   (ABANDON_AFTER_MS). The cron's sweep should have settled it by then, so
 *   one here means the sweep is not running or the provider is not answering.
 * - undelivered invite: a recipient of a sent, still-pending PARALLEL document
 *   whose invitation never went out (sentAt is only stamped when the email
 *   provider accepts it), at least 15 minutes after sending. Sequential
 *   documents are left out: their later signers are legitimately unsent until
 *   it is their turn.
 */
import { prisma } from "@/lib/prisma"
import { AUDIT } from "@/lib/esign/audit"
import { ABANDON_AFTER_MS } from "@/lib/esign/payments/reconcile-rules"
import { emailConfigured } from "@/lib/esign/emails"
import { getSchemaStatus } from "@/lib/schema-status"
import type { AlertInput } from "./alerts"

const MINUTE = 60 * 1000
const DAY = 24 * 60 * MINUTE

export function providerConfig() {
  return {
    stripe: Boolean(process.env.STRIPE_SECRET_KEY),
    stripeWebhook: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
    email: emailConfigured(),
    sentry: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
  }
}

const undeliveredWhere = (now: Date) => ({
  sentAt: null,
  role: { not: "VIEWER" as const },
  signingStatus: "NOT_SIGNED" as const,
  document: { status: "PENDING" as const, signingOrder: "PARALLEL" as const, sentAt: { lt: new Date(now.getTime() - 15 * MINUTE) } },
})

export async function loadHealthCounts(now = new Date()): Promise<AlertInput> {
  const config = providerConfig()
  const [schema, stuckPayments, failedPayments7d, disputes30d, pastDueSubscriptions, undeliveredInvites] = await Promise.all([
    getSchemaStatus(),
    prisma.payment.count({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - ABANDON_AFTER_MS) } } }),
    prisma.payment.count({ where: { status: "FAILED", updatedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.auditEvent.count({ where: { type: AUDIT.PAYMENT_DISPUTED, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } }),
    prisma.subscription.count({ where: { status: { in: ["PAST_DUE", "UNPAID"] } } }),
    prisma.recipient.count({ where: undeliveredWhere(now) }),
  ])
  return {
    pendingMigrations: schema.pending,
    stripeConfigured: config.stripe,
    paystackConfigured: config.paystack,
    emailConfigured: config.email,
    stuckPayments,
    failedPayments7d,
    disputes30d,
    pastDueSubscriptions,
    undeliveredInvites,
  }
}

/** The lists the health page shows under the counts. */
export async function loadHealthLists(now = new Date()) {
  const [stuck, failed, undelivered] = await Promise.all([
    prisma.payment.findMany({
      where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - ABANDON_AFTER_MS) } },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: { id: true, provider: true, amount: true, currency: true, createdAt: true, document: { select: { title: true, user: { select: { email: true } } } } },
    }),
    prisma.auditEvent.findMany({
      where: { type: AUDIT.PAYMENT_FAILED, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, data: true, createdAt: true, document: { select: { title: true, user: { select: { email: true } } } } },
    }),
    prisma.recipient.findMany({
      where: undeliveredWhere(now),
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, email: true, document: { select: { title: true, sentAt: true, user: { select: { email: true } } } } },
    }),
  ])
  return { stuck, failed, undelivered }
}
