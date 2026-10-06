/**
 * Which Sign & Pay payments a sender may download receipts for.
 *
 * Lives with the rest of the payment engine because "whose payment is this"
 * is a payment rule: a Payment belongs to whoever owns the document it was
 * collected on, and only money that actually moved (paid, or paid and then
 * refunded) has a receipt. The shaping into a receipt is generic and lives in
 * src/lib/receipts.ts.
 */
import { prisma } from "@/lib/prisma"
import type { SignAndPaySource } from "@/lib/receipts"

const select = {
  id: true,
  provider: true,
  providerRef: true,
  amount: true,
  currency: true,
  status: true,
  paidAt: true,
  createdAt: true,
  document: { select: { title: true } },
  recipient: { select: { name: true, email: true } },
} as const

/** The most recent payments received on this user's documents. */
export function receivedPayments(userId: string, take = 50): Promise<SignAndPaySource[]> {
  return prisma.payment.findMany({
    where: { document: { userId }, status: { in: ["PAID", "REFUNDED"] } },
    select,
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
    take,
  })
}

/** One payment, only if it was received on one of this user's documents. */
export function receivedPayment(userId: string, paymentId: string): Promise<SignAndPaySource | null> {
  return prisma.payment.findFirst({
    where: { id: paymentId, document: { userId }, status: { in: ["PAID", "REFUNDED"] } },
    select,
  })
}
