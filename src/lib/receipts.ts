/**
 * Receipts for every past payment on the billing page, whatever took it.
 *
 * Three things can have been paid, through two providers, and each describes
 * itself differently:
 *
 *   invoice     a subscription invoice, from Stripe's API
 *   purchase    a one-time plan purchase (Purchase row, paid through Stripe)
 *   signAndPay  a Sign & Pay collection on one of the user's documents,
 *               through Stripe or Paystack (Payment row; the payer is the
 *               signer, the user is who received the money)
 *
 * This file turns each into one `Receipt` shape, which the PDF renderer
 * (receipt-pdf.ts) and the billing page's history both read, so a receipt and
 * the row it was downloaded from cannot disagree. Pure: no database, no
 * provider calls, no clock. Loading belongs to the route and the page.
 */

export type ReceiptKind = "invoice" | "purchase" | "signAndPay"
export const RECEIPT_KINDS: readonly ReceiptKind[] = ["invoice", "purchase", "signAndPay"]

export type ReceiptLine = { label: string; amount: number }

export type Receipt = {
  kind: ReceiptKind
  /** The id the download URL carries: invoice id, Purchase id or Payment id. */
  id: string
  number: string
  issuedAt: Date
  status: "paid" | "refunded"
  provider: "Stripe" | "Paystack"
  description: string
  /** Minor units (cents, pesewas, kobo), like everywhere else. */
  lines: ReceiptLine[]
  /** Discounts, taxes: shown between the lines and the total. Signed. */
  adjustments: ReceiptLine[]
  total: number
  currency: string
  billedTo: { name: string | null; email: string | null }
  /** The provider's own reference, for anyone reconciling with it. */
  reference: string
}

/**
 * A receipt number that is stable for the same payment and readable over the
 * phone: R-YYYYMMDD- and the last eight characters of the record's id. Stripe
 * invoices already carry a number, which is used instead.
 */
export function receiptNumber(issuedAt: Date, id: string): string {
  const day = issuedAt.toISOString().slice(0, 10).replace(/-/g, "")
  return `R-${day}-${id.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase()}`
}

/** A download file name with nothing a file system could object to. */
export function receiptFilename(receipt: Pick<Receipt, "number">): string {
  return `receipt-${receipt.number.replace(/[^a-zA-Z0-9-]/g, "")}.pdf`
}

// ─── From each source ─────────────────────────────────────────────────────────

/** The fields of a Stripe invoice a receipt needs (a structural subset of Stripe.Invoice). */
export type InvoiceSource = {
  id: string
  number: string | null
  status: string | null
  created: number
  currency: string
  total: number
  amount_paid: number
  customer_name: string | null
  customer_email: string | null
  status_transitions?: { paid_at?: number | null } | null
  lines: { data: { description: string | null; amount: number }[] }
  total_discount_amounts?: { amount: number }[] | null
  total_taxes?: { amount: number }[] | null
}

/** Only a paid invoice has a receipt: an open one is a bill, not a payment. */
export function receiptFromInvoice(invoice: InvoiceSource, labels: { subscription: string; discount: string; tax: string }): Receipt | null {
  if (invoice.status !== "paid") return null
  const issuedAt = new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000)
  const discount = (invoice.total_discount_amounts ?? []).reduce((sum, d) => sum + d.amount, 0)
  const tax = (invoice.total_taxes ?? []).reduce((sum, t) => sum + t.amount, 0)
  const adjustments: ReceiptLine[] = []
  if (discount > 0) adjustments.push({ label: labels.discount, amount: -discount })
  if (tax > 0) adjustments.push({ label: labels.tax, amount: tax })
  return {
    kind: "invoice",
    id: invoice.id,
    number: invoice.number ?? receiptNumber(issuedAt, invoice.id),
    issuedAt,
    status: "paid",
    provider: "Stripe",
    description: invoice.lines.data[0]?.description ?? labels.subscription,
    lines: invoice.lines.data.map((line) => ({ label: line.description ?? labels.subscription, amount: line.amount })),
    adjustments,
    total: invoice.amount_paid,
    currency: invoice.currency,
    billedTo: { name: invoice.customer_name, email: invoice.customer_email },
    reference: invoice.id,
  }
}

export type PurchaseSource = {
  id: string
  amount: number
  currency: string
  status: "COMPLETED" | "REFUNDED"
  createdAt: Date
  stripePaymentIntentId: string
  plan: { name: string }
  user: { name: string | null; email: string }
}

export function receiptFromPurchase(purchase: PurchaseSource, labels: { purchase: (plan: string) => string }): Receipt {
  const description = labels.purchase(purchase.plan.name)
  return {
    kind: "purchase",
    id: purchase.id,
    number: receiptNumber(purchase.createdAt, purchase.id),
    issuedAt: purchase.createdAt,
    status: purchase.status === "REFUNDED" ? "refunded" : "paid",
    provider: "Stripe",
    description,
    lines: [{ label: description, amount: purchase.amount }],
    adjustments: [],
    total: purchase.amount,
    currency: purchase.currency,
    billedTo: { name: purchase.user.name, email: purchase.user.email },
    reference: purchase.stripePaymentIntentId,
  }
}

export type SignAndPaySource = {
  id: string
  provider: "STRIPE" | "PAYSTACK"
  providerRef: string
  amount: number
  currency: string
  status: "PENDING" | "PAID" | "FAILED" | "REFUNDED"
  paidAt: Date | null
  createdAt: Date
  document: { title: string }
  recipient: { name: string; email: string }
}

/** Only money that moved has a receipt: pending and failed payments do not. */
export function receiptFromSignAndPay(payment: SignAndPaySource, labels: { signAndPay: (title: string) => string }): Receipt | null {
  if (payment.status !== "PAID" && payment.status !== "REFUNDED") return null
  const issuedAt = payment.paidAt ?? payment.createdAt
  const description = labels.signAndPay(payment.document.title)
  return {
    kind: "signAndPay",
    id: payment.id,
    number: receiptNumber(issuedAt, payment.id),
    issuedAt,
    status: payment.status === "REFUNDED" ? "refunded" : "paid",
    provider: payment.provider === "PAYSTACK" ? "Paystack" : "Stripe",
    description,
    lines: [{ label: description, amount: payment.amount }],
    adjustments: [],
    total: payment.amount,
    currency: payment.currency,
    // The signer paid: the receipt is made out to them, for the sender to
    // keep or forward.
    billedTo: { name: payment.recipient.name, email: payment.recipient.email },
    reference: payment.providerRef,
  }
}

/** Newest first, the order the billing page lists them in. */
export function sortReceipts(receipts: (Receipt | null)[]): Receipt[] {
  return receipts.filter((r): r is Receipt => r !== null).sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
}

/** The path a receipt downloads from (src/app/api/billing/receipts). */
export function receiptHref(receipt: Pick<Receipt, "kind" | "id">): string {
  return `/api/billing/receipts/${receipt.kind}/${encodeURIComponent(receipt.id)}`
}

/**
 * Amount in major units, formatted for the currency (zero-decimal currencies
 * included). `code` writes "GHS 120.00" rather than "GH₵120.00": the PDF
 * receipt uses it, because the standard PDF fonts cannot draw ₵ or ₦.
 */
export function formatAmount(minor: number, currency: string, locale = "en", display: "symbol" | "code" = "symbol"): string {
  const options = { style: "currency", currency: currency.toUpperCase(), currencyDisplay: display } as const
  const digits = new Intl.NumberFormat(locale, options).resolvedOptions().maximumFractionDigits ?? 2
  return new Intl.NumberFormat(locale, options).format(minor / 10 ** digits)
}
