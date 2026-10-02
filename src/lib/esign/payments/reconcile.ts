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
