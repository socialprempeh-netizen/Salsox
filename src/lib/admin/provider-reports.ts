/**
 * What Stripe and Paystack themselves report for a period, fetched live for
 * /admin/revenue and normalised into the shapes src/lib/admin/revenue.ts sums
 * and reconciles. Server only; admin only (the pages check the role).
 *
 * Each provider is asked independently and fails independently: a missing
 * key is `notConfigured`, an API error is `error` with its message, and the
 * page shows the other provider's figures either way. Lists are paged up to
 * MAX_ITEMS; beyond that the report says it is `truncated`, so a partial sum
 * is never presented as a whole one.
 *
 * Only reads. Nothing here creates, refunds or moves money.
 */
import type Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import {
  paystackStatus,
  stripeSessionStatus,
  summarizePaystack,
  summarizeStripeBalance,
  totalsByCurrency,
  type CurrencyTotals,
  type PaystackSummary,
  type ReportedRecord,
  type RevenueLine,
  type StripeSummary,
} from "./revenue"

export const MAX_ITEMS = 2000

export type ProviderReport<T> = { state: "notConfigured" } | { state: "error"; message: string } | ({ state: "ok"; truncated: boolean; live: boolean } & T)

export type FailedCharge = { id: string; amount: number; currency: string; reason: string | null; created: Date }

export type StripeReport = {
  balance: StripeSummary
  /** Paid subscription invoices: Salsox revenue. */
  subscriptionInvoices: RevenueLine[]
  /** Application fees kept from Sign & Pay charges: Salsox revenue. */
  platformFees: RevenueLine[]
  /** Sign & Pay checkouts, keyed by session id (Payment.providerRef). */
  signAndPay: ReportedRecord[]
  /** One-time plan checkouts, keyed by payment intent (Purchase.stripePaymentIntentId). */
  purchases: ReportedRecord[]
  /** Subscription statuses by Stripe id, upper-cased to match ours. */
  subscriptions: { id: string; status: string }[]
  failedCharges: FailedCharge[]
}

export type PaystackSettlement = { id: string; status: string; currency: string; amount: number; date: Date | null }

export type PaystackReport = {
  summary: PaystackSummary
  transactions: ReportedRecord[]
  refunds: CurrencyTotals
  settlements: PaystackSettlement[]
  settled: CurrencyTotals
  failed: { reference: string; amount: number; currency: string; reason: string | null; date: Date | null }[]
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300)

/** Pages a Stripe list to MAX_ITEMS; `truncated` when there was more. */
async function all<T>(list: Stripe.ApiListPromise<T>): Promise<{ items: T[]; truncated: boolean }> {
  const items = await list.autoPagingToArray({ limit: MAX_ITEMS + 1 })
  return { items: items.slice(0, MAX_ITEMS), truncated: items.length > MAX_ITEMS }
}

export async function stripeReport(since: Date): Promise<ProviderReport<StripeReport>> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { state: "notConfigured" }
  const created = { gte: Math.floor(since.getTime() / 1000) }
  try {
    const [balance, invoices, fees, sessions, subscriptions, charges] = await Promise.all([
      all(stripe.balanceTransactions.list({ created, limit: 100 })),
      all(stripe.invoices.list({ created, status: "paid", limit: 100 })),
      all(stripe.applicationFees.list({ created, limit: 100 })),
      all(stripe.checkout.sessions.list({ created, limit: 100, expand: ["data.payment_intent.latest_charge"] })),
      all(stripe.subscriptions.list({ status: "all", limit: 100 })),
      all(stripe.charges.list({ created, limit: 100 })),
    ])

    const signAndPay: ReportedRecord[] = []
    const purchases: ReportedRecord[] = []
    for (const s of sessions.items) {
      if (s.mode !== "payment") continue
      const intent = typeof s.payment_intent === "object" ? s.payment_intent : null
      const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null
      const record = {
        status: stripeSessionStatus({ status: s.status, paymentStatus: s.payment_status, refunded: Boolean(charge?.refunded) }),
        amount: s.amount_total ?? 0,
        currency: s.currency ?? "",
      }
      if (s.metadata?.kind === "sign_and_pay") signAndPay.push({ ref: s.id, ...record })
      else if (intent) purchases.push({ ref: intent.id, ...record })
    }

    return {
      state: "ok",
      live: key.startsWith("sk_live_") || key.startsWith("rk_live_"),
      truncated: [balance, invoices, fees, sessions, subscriptions, charges].some((r) => r.truncated),
      balance: summarizeStripeBalance(
        balance.items.map((t) => ({ id: t.id, type: t.type, reportingCategory: t.reporting_category, amount: t.amount, fee: t.fee, currency: t.currency }))
      ),
      subscriptionInvoices: invoices.items
        .filter((i) => i.amount_paid > 0)
        .map((i) => ({ id: i.id ?? "", kind: "subscription" as const, currency: i.currency, amount: i.amount_paid })),
      platformFees: fees.items.map((f) => ({ id: f.id, kind: "platformFee" as const, currency: f.currency, amount: f.amount - f.amount_refunded })),
      signAndPay,
      purchases,
      subscriptions: subscriptions.items.map((s) => ({ id: s.id, status: s.status.toUpperCase() })),
      failedCharges: charges.items
        .filter((c) => c.status === "failed")
        .map((c) => ({ id: c.id, amount: c.amount, currency: c.currency, reason: c.failure_message ?? c.outcome?.seller_message ?? null, created: new Date(c.created * 1000) })),
    }
  } catch (error) {
    return { state: "error", message: message(error) }
  }
}

// ─── Paystack ────────────────────────────────────────────────────────────────

type PaystackList<T> = { status?: boolean; message?: string; data?: T[]; meta?: { pageCount?: number; page?: number } }

/** Every page of a Paystack list endpoint, up to MAX_ITEMS. */
async function paystackAll<T>(path: string, params: Record<string, string>, key: string): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = []
  for (let page = 1; ; page++) {
    const query = new URLSearchParams({ ...params, perPage: "100", page: String(page) })
    const res = await fetch(`https://api.paystack.co${path}?${query}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    })
    const body = (await res.json().catch(() => null)) as PaystackList<T> | null
    if (!res.ok || !body?.status) throw new Error(`Paystack ${path}: ${body?.message ?? res.status}`)
    items.push(...(body.data ?? []))
    if (items.length > MAX_ITEMS) return { items: items.slice(0, MAX_ITEMS), truncated: true }
    const pageCount = body.meta?.pageCount ?? 1
    if (page >= pageCount || (body.data ?? []).length === 0) return { items, truncated: false }
  }
}

type PaystackTransaction = {
  reference: string
  status: string
  amount: number
  fees?: number | null
  currency: string
  gateway_response?: string | null
  paid_at?: string | null
  created_at?: string | null
  createdAt?: string | null
  fees_split?: { integration?: number | null } | null
}
type PaystackRefund = { amount?: number; currency?: string; status?: string }
type PaystackSettlementRow = { id?: number | string; status?: string; currency?: string; total_amount?: number; effective_amount?: number; settlement_date?: string | null; settled_date?: string | null }

const dateOf = (value: string | null | undefined) => (value ? new Date(value) : null)

export async function paystackReport(since: Date): Promise<ProviderReport<PaystackReport>> {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) return { state: "notConfigured" }
  const from = { from: since.toISOString() }
  try {
    const [transactions, refunds, settlements] = await Promise.all([
      paystackAll<PaystackTransaction>("/transaction", from, key),
      paystackAll<PaystackRefund>("/refund", from, key),
      paystackAll<PaystackSettlementRow>("/settlement", from, key),
    ])
    const settlementRows: PaystackSettlement[] = settlements.items.map((s) => ({
      id: String(s.id ?? ""),
      status: s.status ?? "unknown",
      currency: s.currency ?? "",
      amount: s.effective_amount ?? s.total_amount ?? 0,
      date: dateOf(s.settlement_date ?? s.settled_date),
    }))
    return {
      state: "ok",
      live: key.startsWith("sk_live_"),
      truncated: transactions.truncated || refunds.truncated || settlements.truncated,
      summary: summarizePaystack(
        transactions.items.map((t) => ({
          reference: t.reference,
          status: t.status,
          amount: t.amount,
          fees: t.fees ?? 0,
          currency: t.currency,
          platformShare: t.fees_split?.integration ?? null,
        }))
      ),
      transactions: transactions.items.map((t) => ({ ref: t.reference, status: paystackStatus(t.status), amount: t.amount, currency: t.currency })),
      refunds: totalsByCurrency(
        refunds.items.filter((r) => r.status !== "failed" && r.amount && r.currency).map((r) => ({ currency: r.currency!, amount: r.amount! }))
      ),
      settlements: settlementRows,
      settled: totalsByCurrency(settlementRows.filter((s) => s.status === "success" || s.status === "processed").map((s) => ({ currency: s.currency, amount: s.amount }))),
      failed: transactions.items
        .filter((t) => t.status === "failed")
        .map((t) => ({ reference: t.reference, amount: t.amount, currency: t.currency, reason: t.gateway_response ?? null, date: dateOf(t.created_at ?? t.createdAt) })),
    }
  } catch (error) {
    return { state: "error", message: message(error) }
  }
}

// ─── Plan changes ────────────────────────────────────────────────────────────

export type PlanChange = { subscriptionId: string; fromPriceId: string; toPriceId: string; at: Date }

/**
 * Subscriptions whose price changed since `since`, from Stripe's
 * `customer.subscription.updated` events (Stripe keeps events for 30 days,
 * so a longer period reads what is left). Our database keeps only the current
 * plan, which is why this comes from Stripe.
 */
export async function stripePlanChanges(since: Date): Promise<ProviderReport<{ changes: PlanChange[] }>> {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) return { state: "notConfigured" }
  try {
    const events = await all(stripe.events.list({ type: "customer.subscription.updated", created: { gte: Math.floor(since.getTime() / 1000) }, limit: 100 }))
    const changes: PlanChange[] = []
    for (const event of events.items) {
      const subscription = event.data.object as Stripe.Subscription
      const previous = event.data.previous_attributes as { items?: { data?: { price?: { id?: string } }[] } } | undefined
      const fromPriceId = previous?.items?.data?.[0]?.price?.id
      const toPriceId = subscription.items?.data?.[0]?.price?.id
      if (fromPriceId && toPriceId && fromPriceId !== toPriceId) {
        changes.push({ subscriptionId: subscription.id, fromPriceId, toPriceId, at: new Date(event.created * 1000) })
      }
    }
    return { state: "ok", live: key.startsWith("sk_live_") || key.startsWith("rk_live_"), truncated: events.truncated, changes }
  } catch (error) {
    return { state: "error", message: message(error) }
  }
}
