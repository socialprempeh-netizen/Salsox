/**
 * The per-customer breakdown on /admin/customers, as pure functions.
 *
 * The overview page answers "how is the business doing"; this answers "who is
 * it doing it with": for each account, what they pay us, how much they send,
 * how much of it gets finished, and how much money moves through Sign & Pay
 * on their documents. The page loads aggregated rows (one query per figure,
 * grouped in the database) and this file turns them into rows and totals, so
 * the arithmetic is tested without a database.
 *
 * Sign & Pay volume is money the signers paid the sender, not revenue of
 * ours, and it comes in several currencies: it is kept per currency and never
 * summed across them.
 */
import { monthlyEquivalent, type MrrPlan } from "@/lib/metrics"

export type CustomerInput = {
  id: string
  email: string
  name: string | null
  createdAt: Date
  /** The live subscription's plan, or null for a free account. */
  plan: (MrrPlan & { name: string }) | null
  /** Document counts by status, as grouped by the database. */
  documents: { status: string; count: number }[]
  /** Sign & Pay sums by currency and status, in minor units. */
  payments: { currency: string; status: string; amount: number; count: number }[]
}

export type CustomerRow = {
  id: string
  email: string
  name: string | null
  createdAt: Date
  planName: string | null
  /** Monthly-equivalent plan revenue, in cents. */
  monthlyRevenue: number
  documentsSent: number
  documentsCompleted: number
  /** Completed out of sent, 0..1, or null when nothing was sent. */
  completionRate: number | null
  /** Collected and still held (PAID), per currency, in minor units. */
  collected: Record<string, number>
  /** Given back (REFUNDED), per currency, in minor units. */
  refunded: Record<string, number>
}

/** Statuses a document reaches only after it was sent. */
const SENT_STATUSES = new Set(["PENDING", "COMPLETED", "REJECTED", "CANCELLED", "EXPIRED"])

export function customerRow(input: CustomerInput): CustomerRow {
  const documentsSent = input.documents.filter((d) => SENT_STATUSES.has(d.status)).reduce((n, d) => n + d.count, 0)
  const documentsCompleted = input.documents.find((d) => d.status === "COMPLETED")?.count ?? 0
  const collected: Record<string, number> = {}
  const refunded: Record<string, number> = {}
  for (const p of input.payments) {
    const bucket = p.status === "PAID" ? collected : p.status === "REFUNDED" ? refunded : null
    if (bucket) bucket[p.currency] = (bucket[p.currency] ?? 0) + p.amount
  }
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    createdAt: input.createdAt,
    planName: input.plan?.name ?? null,
    monthlyRevenue: input.plan ? monthlyEquivalent(input.plan) : 0,
    documentsSent,
    documentsCompleted,
    completionRate: documentsSent > 0 ? documentsCompleted / documentsSent : null,
    collected,
    refunded,
  }
}

export type CustomerSort = "documents" | "revenue" | "volume" | "newest"

export const CUSTOMER_SORTS: CustomerSort[] = ["documents", "revenue", "volume", "newest"]

export function parseCustomerSort(value: string | undefined): CustomerSort {
  return CUSTOMER_SORTS.includes(value as CustomerSort) ? (value as CustomerSort) : "documents"
}

/**
 * Orders rows for the table. "volume" ranks by the number of currencies'
 * worth of collected money only as a tie-breaker; the main key is the count
 * of paid Sign & Pay transactions, since amounts in different currencies
 * cannot be compared.
 */
export function sortCustomers(rows: (CustomerRow & { paidCount?: number })[], sort: CustomerSort) {
  const key = (r: CustomerRow & { paidCount?: number }): number => {
    switch (sort) {
      case "revenue":
        return r.monthlyRevenue
      case "volume":
        return r.paidCount ?? 0
      case "newest":
        return r.createdAt.getTime()
      default:
        return r.documentsSent
    }
  }
  return [...rows].sort((a, b) => key(b) - key(a) || a.email.localeCompare(b.email))
}

/** Totals across every customer: plan revenue, documents, and volume per currency. */
export function customerTotals(rows: CustomerRow[]) {
  const collected: Record<string, number> = {}
  for (const r of rows) for (const [c, v] of Object.entries(r.collected)) collected[c] = (collected[c] ?? 0) + v
  const sent = rows.reduce((n, r) => n + r.documentsSent, 0)
  const completed = rows.reduce((n, r) => n + r.documentsCompleted, 0)
  return {
    customers: rows.length,
    payingCustomers: rows.filter((r) => r.monthlyRevenue > 0).length,
    monthlyRevenue: rows.reduce((n, r) => n + r.monthlyRevenue, 0),
    documentsSent: sent,
    documentsCompleted: completed,
    completionRate: sent > 0 ? completed / sent : null,
    collected,
  }
}
