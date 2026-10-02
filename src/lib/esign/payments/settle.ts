/**
 * Sign & Pay after the checkout: refunds, open checkouts on closed documents,
 * and refunds or chargebacks that happen at the provider.
 *
 * Everything that changes a payment after it was started, other than
 * "it went through", lives here: `confirmPayment` (signing.ts) decides with
 * reconcile-rules.ts and calls `refundPayment`; closing a document calls
 * `closeOpenCheckouts`; the Stripe and Paystack webhooks call
 * `recordProviderRefund` and `recordDispute`.
 *
 * It imports neither signing.ts nor documents.ts, which both call into it.
 *
 * Every write is idempotent, because providers deliver events at least once
 * and the sweeps retry: a refund is keyed by payment at the provider, an
 * event is recorded once per provider id, and status changes are guarded.
 */
import type { Payment, PaymentStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { AUDIT, recordAudit } from "../audit"
import { sendPaymentDisputed, sendPaymentRefunded } from "../emails"
import { signingUrl } from "../share"
import { getProvider } from "./index"
import { formatMinorUnits } from "./select"

type PaymentWithPeople = Payment & {
  recipient: { email: string; name: string; token: string }
  document: { id: string; title: string; user: { email: string; name: string | null } }
}

async function loadPayment(where: { id: string } | { providerRef: string }): Promise<PaymentWithPeople | null> {
  return prisma.payment.findUnique({
    where,
    include: {
      recipient: { select: { email: true, name: true, token: true } },
      document: { select: { id: true, title: true, user: { select: { email: true, name: true } } } },
    },
  })
}

/** True when an audit event of this type already carries this provider id. */
async function alreadyRecorded(documentId: string, type: string, key: string): Promise<boolean> {
  const found = await prisma.auditEvent.findFirst({
    where: { documentId, type, data: { path: ["eventKey"], equals: key } },
    select: { id: true },
  })
  return Boolean(found)
}

/**
 * Gives a payment back in full, records it, and tells both sides why.
 * Throws when the provider refuses, leaving the row as it was so the next
 * reconciliation tries again.
 */
export async function refundPayment(paymentId: string, reason: "documentClosed" | "duplicate"): Promise<void> {
  const payment = await loadPayment({ id: paymentId })
  if (!payment || payment.status === "REFUNDED") return
  const { refundId } = await getProvider(payment.provider).refund({ providerRef: payment.providerRef, paymentId })

  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: { not: "REFUNDED" } },
    data: { status: "REFUNDED" },
  })
  if (updated.count === 0) return // another run recorded it

  await recordAudit(prisma, {
    documentId: payment.documentId,
    recipientId: payment.recipientId,
    type: AUDIT.PAYMENT_REFUNDED,
    data: { eventKey: refundId, reason, automatic: true, amount: payment.amount, currency: payment.currency, provider: payment.provider },
  })
  const amountLabel = formatMinorUnits(payment.amount, payment.currency)
  const base = siteConfig.url
  await sendPaymentRefunded({
    to: payment.document.user.email,
    name: payment.document.user.name || payment.document.user.email,
    title: payment.document.title,
    amountLabel,
    reason,
    audience: "owner",
    url: `${base}/dashboard/documents/${payment.document.id}`,
  })
  await sendPaymentRefunded({
    to: payment.recipient.email,
    name: payment.recipient.name,
    title: payment.document.title,
    amountLabel,
    reason,
    audience: "payer",
    url: signingUrl(base, payment.recipient.token),
  })
}

/**
 * A document stopped collecting (cancelled, expired, declined): settle every
 * checkout still open on it. Paid meanwhile: refunded. Still open: closed at
 * the provider where it can be (Stripe), and marked failed; where it cannot
 * (Paystack) it stays pending, and a payment that still lands is refunded by
 * the next reconciliation. Never throws: closing the document must not fail
 * because a provider is slow.
 */
export async function closeOpenCheckouts(documentId: string): Promise<void> {
  const open = await prisma.payment.findMany({ where: { documentId, status: "PENDING" }, select: { id: true } })
  for (const { id } of open) {
    try {
      const payment = await loadPayment({ id })
      if (!payment || payment.status !== "PENDING") continue
      const provider = getProvider(payment.provider)
      const verified = await provider.verify(payment.providerRef)
      if (verified.status === "PAID") {
        await refundPayment(payment.id, "documentClosed")
        continue
      }
      const closed = verified.status === "FAILED" || (await provider.cancelCheckout(payment.providerRef))
      if (closed) await markFailed(payment, "documentClosed")
    } catch (error) {
      console.error("[esign] could not settle an open checkout on a closed document", id, error)
    }
  }
}

/** Marks a payment failed once, with the reason on the trail. */
export async function markFailed(payment: Pick<Payment, "id" | "documentId" | "recipientId" | "provider">, reason: string): Promise<void> {
  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: "PENDING" },
    data: { status: "FAILED" satisfies PaymentStatus },
  })
  if (updated.count === 0) return
  await recordAudit(prisma, {
    documentId: payment.documentId,
    recipientId: payment.recipientId,
    type: AUDIT.PAYMENT_FAILED,
    data: { reason, provider: payment.provider },
  })
}

/**
 * A refund made at the provider (from its dashboard, or one of ours echoed
 * back by a webhook). `eventKey` identifies it at the provider; `full` says
 * whether the whole amount is now returned, which is when the payment counts
 * as REFUNDED. A partial refund is recorded and the payment stays PAID.
 */
export async function recordProviderRefund(args: {
  find: { id: string } | { providerRef: string }
  eventKey: string
  amount: number
  /** Omitted when the provider does not say: then judged by the amount. */
  full?: boolean
}): Promise<void> {
  const payment = await loadPayment(args.find)
  if (!payment) return
  const full = args.full ?? args.amount >= payment.amount
  if (await alreadyRecorded(payment.documentId, AUDIT.PAYMENT_REFUNDED, args.eventKey)) return
  // Our own automatic refund comes back as a webhook too: already recorded
  // under the refund's own id, so skip it rather than log it twice.
  if (payment.status === "REFUNDED" && full) {
    const automatic = await prisma.auditEvent.findFirst({
      where: { documentId: payment.documentId, type: AUDIT.PAYMENT_REFUNDED, data: { path: ["automatic"], equals: true } },
      select: { id: true },
    })
    if (automatic) return
  }
  if (full) {
    await prisma.payment.updateMany({ where: { id: payment.id, status: { not: "REFUNDED" } }, data: { status: "REFUNDED" } })
  }
  await recordAudit(prisma, {
    documentId: payment.documentId,
    recipientId: payment.recipientId,
    type: AUDIT.PAYMENT_REFUNDED,
    data: { eventKey: args.eventKey, amount: args.amount, currency: payment.currency, full, provider: payment.provider },
  })
}

/**
 * A chargeback opened or closed by the payer's bank. Opened: recorded and the
 * sender alerted. Closed: recorded with the outcome; a lost dispute means the
 * money went back to the payer, so the payment counts as REFUNDED.
 */
export async function recordDispute(args: {
  find: { id: string } | { providerRef: string }
  disputeId: string
  stage: "opened" | "closed"
  /** For a closed dispute: whether the sender kept the money. */
  outcome?: "won" | "lost"
  reason?: string
  amount?: number
}): Promise<void> {
  const payment = await loadPayment(args.find)
  if (!payment) return
  const type = args.stage === "opened" ? AUDIT.PAYMENT_DISPUTED : AUDIT.PAYMENT_DISPUTE_CLOSED
  const eventKey = `${args.disputeId}:${args.stage}`
  if (await alreadyRecorded(payment.documentId, type, eventKey)) return

  await recordAudit(prisma, {
    documentId: payment.documentId,
    recipientId: payment.recipientId,
    type,
    data: {
      eventKey,
      amount: args.amount ?? payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      ...(args.reason ? { reason: args.reason } : {}),
      ...(args.outcome ? { outcome: args.outcome } : {}),
    },
  })
  if (args.stage === "closed" && args.outcome === "lost") {
    await prisma.payment.updateMany({ where: { id: payment.id, status: { not: "REFUNDED" } }, data: { status: "REFUNDED" } })
  }
  if (args.stage === "opened") {
    await sendPaymentDisputed({
      to: payment.document.user.email,
      name: payment.document.user.name || payment.document.user.email,
      title: payment.document.title,
      amountLabel: formatMinorUnits(args.amount ?? payment.amount, payment.currency),
      url: `${siteConfig.url}/dashboard/documents/${payment.document.id}`,
    })
  }
}
