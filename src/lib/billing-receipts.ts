/**
 * Loads the receipts a signed-in user may download: the list on the billing
 * page and the single one behind each download link come from here, so a
 * row can never offer a receipt the route would refuse, or the reverse.
 *
 * Ownership is part of every query, never a check after the fact:
 * - invoices are read from Stripe and must belong to the user's own Stripe
 *   customer (an invoice id from somebody else's account is "not found");
 * - purchases are scoped by userId;
 * - Sign & Pay payments are scoped by the owner of their document
 *   (src/lib/esign/payments/receipts.ts).
 *
 * Shaping is in receipts.ts; this file only fetches.
 */
import { getTranslations } from "next-intl/server"
import { prisma } from "@/lib/prisma"
import { receivedPayment, receivedPayments } from "@/lib/esign/payments/receipts"
import {
  receiptFromInvoice,
  receiptFromPurchase,
  receiptFromSignAndPay,
  sortReceipts,
  type InvoiceSource,
  type Receipt,
  type ReceiptKind,
} from "./receipts"

async function sourceLabels() {
  const t = await getTranslations("receipts")
  return {
    subscription: t("subscription"),
    discount: t("discount"),
    tax: t("tax"),
    purchase: (plan: string) => t("purchase", { plan }),
    signAndPay: (title: string) => t("signAndPay", { title }),
  }
}

const stripeReady = () => Boolean(process.env.STRIPE_SECRET_KEY) && process.env.DEMO_MODE !== "true"

async function customerId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } })
  return user?.stripeCustomerId ?? null
}

/** Every receipt the user can download, newest first. */
export async function listReceipts(userId: string): Promise<Receipt[]> {
  const labels = await sourceLabels()
  const customer = await customerId(userId)

  const [invoices, purchases, payments] = await Promise.all([
    customer && stripeReady()
      ? import("@/lib/stripe")
          .then(({ stripe }) => stripe.invoices.list({ customer, status: "paid", limit: 24 }))
          .then((list) => list.data as unknown as InvoiceSource[])
          // Stripe being unreachable must not take the billing page down.
          .catch(() => [] as InvoiceSource[])
      : Promise.resolve([] as InvoiceSource[]),
    prisma.purchase.findMany({
      where: { userId },
      include: { plan: { select: { name: true } }, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    }),
    receivedPayments(userId),
  ])

  return sortReceipts([
    ...invoices.map((invoice) => receiptFromInvoice(invoice, labels)),
    ...purchases.map((purchase) => receiptFromPurchase(purchase, labels)),
    ...payments.map((payment) => receiptFromSignAndPay(payment, labels)),
  ])
}

/** One receipt, or null when it does not exist or is not this user's. */
export async function loadReceipt(userId: string, kind: ReceiptKind, id: string): Promise<Receipt | null> {
  const labels = await sourceLabels()

  if (kind === "invoice") {
    const customer = await customerId(userId)
    if (!customer || !stripeReady() || !/^in_[A-Za-z0-9]+$/.test(id)) return null
    try {
      const { stripe } = await import("@/lib/stripe")
      const invoice = await stripe.invoices.retrieve(id)
      const owner = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id
      if (owner !== customer) return null
      return receiptFromInvoice(invoice as unknown as InvoiceSource, labels)
    } catch {
      return null
    }
  }

  if (kind === "purchase") {
    const purchase = await prisma.purchase.findFirst({
      where: { id, userId },
      include: { plan: { select: { name: true } }, user: { select: { name: true, email: true } } },
    })
    return purchase ? receiptFromPurchase(purchase, labels) : null
  }

  const payment = await receivedPayment(userId, id)
  return payment ? receiptFromSignAndPay(payment, labels) : null
}
