/**
 * The Sign & Pay reconciliation sweep: asks the provider about every payment
 * still marked pending, and settles it.
 *
 * A pending payment used to stay pending until someone happened to come back
 * through the return URL or a webhook happened to arrive. Webhooks get lost,
 * signers close the tab on the "thank you" page, and Paystack has no way to
 * void an open checkout, so a payment could sit unconfirmed, or be taken for
 * a document that had since closed, with nobody looking. This runs from the
 * daily cron (api/cron/esign), and for one document whenever its owner opens
 * it, and hands each payment to `confirmPayment`, which applies the rules in
 * reconcile-rules.ts.
 */
import { prisma } from "@/lib/prisma"
import { confirmPayment } from "../signing"
import { getProvider } from "./index"
import { passProcessorFee } from "./settle"
import { RECHECK_AFTER_MS } from "./reconcile-rules"

/** Settles pending payments older than RECHECK_AFTER_MS. Returns how many changed. */
export async function reconcilePayments(now = new Date(), where: { documentId?: string } = {}): Promise<number> {
  const stale = await prisma.payment.findMany({
    where: { ...where, status: "PENDING", createdAt: { lte: new Date(now.getTime() - RECHECK_AFTER_MS) } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  })
  let settled = 0
  for (const { id } of stale) {
    try {
      if ((await confirmPayment(id)) !== "PENDING") settled++
    } catch (error) {
      // One provider outage must not stop the others from being checked.
      console.error("[esign] payment reconciliation failed", id, error)
    }
  }
  return settled
}

/** How far back the fee sweep looks: long enough to outlast an outage, short enough to stay cheap. */
export const FEE_SWEEP_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Passes on the processor fee for payments paid in the last week whose fee
 * was not taken when they were confirmed: the charge was not final yet, or
 * the provider was unreachable. The provider is the record of what was
 * taken (a labelled transfer reversal at Stripe), so asking again is safe
 * and nothing in the database has to track it. Returns how many fees were
 * taken or confirmed.
 */
export async function recoverProcessorFees(now = new Date(), where: { documentId?: string } = {}): Promise<number> {
  const recoverable = (["STRIPE", "PAYSTACK"] as const).filter((p) => getProvider(p).recoverProcessorFee)
  if (recoverable.length === 0) return 0
  const paid = await prisma.payment.findMany({
    where: { ...where, status: "PAID", provider: { in: [...recoverable] }, paidAt: { gte: new Date(now.getTime() - FEE_SWEEP_WINDOW_MS) } },
    select: { id: true, provider: true, providerRef: true },
    orderBy: { paidAt: "asc" },
    take: 100,
  })
  let recovered = 0
  for (const payment of paid) {
    try {
      if ((await passProcessorFee(payment))?.status === "recovered") recovered++
    } catch (error) {
      console.error("[esign] processor fee sweep failed", payment.id, error)
    }
  }
  return recovered
}
