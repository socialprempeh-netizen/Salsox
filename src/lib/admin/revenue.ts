/**
 * The arithmetic behind /admin/revenue, as pure functions: totals per
 * currency, revenue by kind, the provider summaries, and reconciliation
 * between Salsox's own records and what Stripe and Paystack report.
 *
 * Three rules hold throughout, and the tests beside this file pin them:
 *
 * 1. Money is kept per currency. Amounts are minor units (cents, pesewas,
 *    kobo) under an upper-case ISO code, and two currencies are never added.
 *    A combined total across currencies exists only through `convertTotals`,
 *    which needs one rate table that covers every currency involved and
 *    returns null otherwise, so a page cannot show a total that silently
 *    left a currency out or mixed rates.
 *
 * 2. A payment is counted once. Totals over our own records key each payment
 *    by its id, so a row that appears in two inputs (a Sign & Pay payment
 *    listed under both its provider and the combined view) is not added
 *    twice; Stripe and Paystack figures are shown side by side, never summed
 *    with our records.
 *
 * 3. Sign & Pay money is the senders', not Salsox's. It goes to the sender's
 *    Stripe Connect account or Paystack subaccount; only the platform fee, if
 *    one is set, is Salsox revenue. Volume and revenue are separate figures.
 */

export type CurrencyTotals = Record<string, number>

const code = (currency: string) => currency.trim().toUpperCase()

/** Adds `amount` to `totals[currency]`, in place. */
export function addTo(totals: CurrencyTotals, currency: string, amount: number): CurrencyTotals {
  const c = code(currency)
  totals[c] = (totals[c] ?? 0) + amount
  return totals
}

/** Sum per currency. */
export function totalsByCurrency(rows: { currency: string; amount: number }[]): CurrencyTotals {
  const totals: CurrencyTotals = {}
  for (const r of rows) addTo(totals, r.currency, r.amount)
  return totals
}

/** Element-wise sum of several per-currency totals. */
export function mergeTotals(...all: CurrencyTotals[]): CurrencyTotals {
  const out: CurrencyTotals = {}
  for (const totals of all) for (const [c, v] of Object.entries(totals)) addTo(out, c, v)
  return out
}

/** Currencies in a stable order: the largest totals first, then by code. */
export function currenciesOf(...all: CurrencyTotals[]): string[] {
  const merged = mergeTotals(...all)
  return Object.keys(merged).sort((a, b) => merged[b] - merged[a] || a.localeCompare(b))
}

// ─── Conversion ──────────────────────────────────────────────────────────────

/**
 * One rate table, stated once: how many `base` units one unit of each
 * currency is worth, as of a date. Read from ADMIN_FX_RATES; there is no
 * default, because a guessed rate is worse than no total.
 */
export type FxTable = { base: string; asOf: string; rates: Record<string, number> }

/** Parses ADMIN_FX_RATES, e.g. {"base":"USD","asOf":"2026-10-15","rates":{"GHS":0.064}}. Null when unset or malformed. */
export function parseFxTable(raw: string | undefined | null): FxTable | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<FxTable>
    if (typeof value.base !== "string" || typeof value.asOf !== "string" || !value.rates || typeof value.rates !== "object") return null
    const rates: Record<string, number> = {}
    for (const [c, r] of Object.entries(value.rates)) {
      if (typeof r !== "number" || !Number.isFinite(r) || r <= 0) return null
      rates[code(c)] = r
    }
    return { base: code(value.base), asOf: value.asOf, rates }
  } catch {
    return null
  }
}

/**
 * The totals in the table's base currency, or null when any currency has no
 * rate. All-or-nothing on purpose: a partial conversion is a wrong total.
 * Minor units are treated as comparable across currencies with two decimals;
 * a zero-decimal currency would need its own exponent, and none is used.
 */
export function convertTotals(totals: CurrencyTotals, fx: FxTable | null): { currency: string; amount: number; asOf: string } | null {
  if (!fx) return null
  let sum = 0
  for (const [c, amount] of Object.entries(totals)) {
    if (amount === 0) continue
    const rate = c === fx.base ? 1 : fx.rates[c]
    if (rate === undefined) return null
    sum += amount * rate
  }
  return { currency: fx.base, amount: Math.round(sum), asOf: fx.asOf }
}

// ─── Our records ─────────────────────────────────────────────────────────────

export type Provider = "STRIPE" | "PAYSTACK"
export type RecordStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED"

/** A Sign & Pay payment as Salsox recorded it (a Payment row). */
export type RecordedPayment = { id: string; provider: Provider; amount: number; currency: string; status: RecordStatus }

export type ProviderVolume = {
  paid: CurrencyTotals
  refunded: CurrencyTotals
  counts: Record<RecordStatus, number>
}

const emptyVolume = (): ProviderVolume => ({ paid: {}, refunded: {}, counts: { PENDING: 0, PAID: 0, FAILED: 0, REFUNDED: 0 } })

/**
 * Sign & Pay volume per provider, and combined per currency. Each payment id
 * counts once, whichever lists it was passed in: the first occurrence wins.
 * A payment belongs to exactly one provider (a recipient who tried Stripe and
 * then paid through Paystack has two rows, and only the PAID one is volume).
 */
export function signAndPayVolume(payments: RecordedPayment[]): { byProvider: Record<Provider, ProviderVolume>; paid: CurrencyTotals; refunded: CurrencyTotals } {
  const seen = new Set<string>()
  const byProvider: Record<Provider, ProviderVolume> = { STRIPE: emptyVolume(), PAYSTACK: emptyVolume() }
  for (const p of payments) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const v = byProvider[p.provider]
    v.counts[p.status]++
    if (p.status === "PAID") addTo(v.paid, p.currency, p.amount)
    if (p.status === "REFUNDED") addTo(v.refunded, p.currency, p.amount)
  }
  return {
    byProvider,
    paid: mergeTotals(byProvider.STRIPE.paid, byProvider.PAYSTACK.paid),
    refunded: mergeTotals(byProvider.STRIPE.refunded, byProvider.PAYSTACK.refunded),
  }
}

export type RevenueKind = "subscription" | "oneTime" | "platformFee"
export type RevenueLine = { id: string; kind: RevenueKind; currency: string; amount: number }

/** Salsox's own revenue by kind and in total, per currency, each line once. */
export function revenueByKind(lines: RevenueLine[]): Record<RevenueKind | "total", CurrencyTotals> {
  const seen = new Set<string>()
  const out: Record<RevenueKind | "total", CurrencyTotals> = { subscription: {}, oneTime: {}, platformFee: {}, total: {} }
  for (const line of lines) {
    const key = `${line.kind}:${line.id}`
    if (seen.has(key)) continue
    seen.add(key)
    addTo(out[line.kind], line.currency, line.amount)
    addTo(out.total, line.currency, line.amount)
  }
  return out
}

// ─── Provider reports ────────────────────────────────────────────────────────

/** A Stripe balance transaction, reduced to what the summary needs. */
export type StripeBalanceTxn = { id: string; type: string; reportingCategory?: string | null; amount: number; fee: number; currency: string }

export type StripeSummary = {
  /** Money in: charges and payments, before fees. */
  gross: CurrencyTotals
  /** Stripe's own fees on every movement. */
  fees: CurrencyTotals
  refunds: CurrencyTotals
  /** Money sent to Salsox's bank. */
  payouts: CurrencyTotals
  /** Sign & Pay money moved to senders' connected accounts, net of reversals. */
  transfers: CurrencyTotals
  /** Chargebacks and their reversals, net. */
  disputes: CurrencyTotals
}

/**
 * Groups Stripe balance transactions. Refunds, payouts and transfers are
 * debits in the balance (negative amounts) and are reported as positive
 * figures; transfer reversals reduce transfers. Each transaction id counts
 * once.
 */
export function summarizeStripeBalance(txns: StripeBalanceTxn[]): StripeSummary {
  const s: StripeSummary = { gross: {}, fees: {}, refunds: {}, payouts: {}, transfers: {}, disputes: {} }
  const seen = new Set<string>()
  for (const t of txns) {
    if (seen.has(t.id)) continue
    seen.add(t.id)
    if (t.fee) addTo(s.fees, t.currency, t.fee)
    const category = t.reportingCategory ?? t.type
    if (category === "charge" || t.type === "charge" || t.type === "payment") addTo(s.gross, t.currency, t.amount)
    else if (category === "refund" || t.type === "refund" || t.type === "payment_refund") addTo(s.refunds, t.currency, -t.amount)
    else if (category === "payout" || t.type === "payout") addTo(s.payouts, t.currency, -t.amount)
    else if (category === "transfer" || t.type === "transfer") addTo(s.transfers, t.currency, -t.amount)
    else if (category === "transfer_reversal" || t.type === "transfer_reversal") addTo(s.transfers, t.currency, -t.amount)
    else if (category === "dispute" || t.type === "adjustment") addTo(s.disputes, t.currency, -t.amount)
  }
  return s
}

/** A Paystack transaction, reduced. `platformShare` is the integration's split, when Paystack reports one. */
export type PaystackTxn = { reference: string; status: string; amount: number; fees: number; currency: string; platformShare?: number | null }

export type PaystackSummary = { gross: CurrencyTotals; fees: CurrencyTotals; platformShare: CurrencyTotals; failed: number; abandoned: number }

/** Successful volume, fees and platform share per currency; failed and abandoned counted. Each reference once. */
export function summarizePaystack(txns: PaystackTxn[]): PaystackSummary {
  const s: PaystackSummary = { gross: {}, fees: {}, platformShare: {}, failed: 0, abandoned: 0 }
  const seen = new Set<string>()
  for (const t of txns) {
    if (seen.has(t.reference)) continue
    seen.add(t.reference)
    if (t.status === "success") {
      addTo(s.gross, t.currency, t.amount)
      if (t.fees) addTo(s.fees, t.currency, t.fees)
      if (t.platformShare) addTo(s.platformShare, t.currency, t.platformShare)
    } else if (t.status === "failed") s.failed++
    else if (t.status === "abandoned") s.abandoned++
  }
  return s
}

// ─── Reconciliation ──────────────────────────────────────────────────────────

/** A provider's status, mapped to ours. OPEN is a checkout nobody finished (open, abandoned, expired-but-unpaid). */
export type ReportedStatus = "PAID" | "REFUNDED" | "FAILED" | "OPEN"

/** Stripe Checkout Session state → ours. */
export function stripeSessionStatus(session: { status: string | null; paymentStatus: string; refunded: boolean }): ReportedStatus {
  if (session.paymentStatus === "paid" || session.paymentStatus === "no_payment_required") return session.refunded ? "REFUNDED" : "PAID"
  if (session.status === "expired") return "OPEN"
  return "OPEN"
}

/** Paystack transaction status → ours. */
export function paystackStatus(status: string): ReportedStatus {
  if (status === "success") return "PAID"
  if (status === "reversed") return "REFUNDED"
  if (status === "failed") return "FAILED"
  return "OPEN"
}

export type OurRecord = { id: string; ref: string; status: RecordStatus; amount: number; currency: string }
export type ReportedRecord = { ref: string; status: ReportedStatus; amount: number; currency: string }

export type ReconIssue =
  | { kind: "missingAtProvider"; ours: OurRecord }
  | { kind: "missingInRecords"; theirs: ReportedRecord }
  | { kind: "statusMismatch"; ours: OurRecord; theirs: ReportedRecord }
  | { kind: "amountMismatch"; ours: OurRecord; theirs: ReportedRecord }

/**
 * Whether our status agrees with the provider's. A checkout nobody finished
 * is PENDING with us until the sweep gives up on it (then FAILED), and stays
 * open or abandoned at the provider: both are agreement. Everything else must
 * match exactly; a PENDING row the provider says is PAID is the case that
 * matters most (money taken, not yet recorded).
 */
export function statusesAgree(ours: RecordStatus, theirs: ReportedStatus): boolean {
  if (theirs === "OPEN") return ours === "PENDING" || ours === "FAILED"
  if (theirs === "FAILED") return ours === "FAILED"
  return ours === theirs
}

/**
 * Compares our records with a provider's report over the same window, matched
 * on the provider reference. Missing pending checkouts at the provider are not
 * flagged (a row created but never opened has nothing to find there).
 */
export function reconcile(ours: OurRecord[], theirs: ReportedRecord[]): { matched: number; issues: ReconIssue[] } {
  const byRef = new Map(theirs.map((t) => [t.ref, t]))
  const ourRefs = new Set<string>()
  const issues: ReconIssue[] = []
  let matched = 0
  for (const o of ours) {
    if (ourRefs.has(o.ref)) continue
    ourRefs.add(o.ref)
    const t = byRef.get(o.ref)
    if (!t) {
      if (o.status !== "PENDING" && o.status !== "FAILED") issues.push({ kind: "missingAtProvider", ours: o })
      continue
    }
    if (!statusesAgree(o.status, t.status)) issues.push({ kind: "statusMismatch", ours: o, theirs: t })
    else if (t.status === "PAID" && (t.amount !== o.amount || code(t.currency) !== code(o.currency))) issues.push({ kind: "amountMismatch", ours: o, theirs: t })
    else matched++
  }
  for (const t of theirs) {
    if (!ourRefs.has(t.ref) && t.status !== "OPEN") issues.push({ kind: "missingInRecords", theirs: t })
  }
  return { matched, issues }
}

/** Stripe subscription statuses that mean the customer should have access (or is about to lose it). */
const LIVE_SUBSCRIPTION = new Set(["ACTIVE", "TRIALING", "PAST_DUE"])

export type SubscriptionIssue = { kind: "missingAtProvider" | "missingInRecords" | "statusMismatch"; ref: string; ours: string | null; theirs: string | null }

/**
 * Our Subscription rows against Stripe's, on status alone (their money is in
 * invoices, which the summary reads). Statuses compare upper-cased. A Stripe
 * subscription we have no row for is an issue only while it is live: an old
 * canceled one is history, not a gap.
 */
export function reconcileSubscriptions(ours: { ref: string; status: string }[], theirs: { ref: string; status: string }[]): { matched: number; issues: SubscriptionIssue[] } {
  const byRef = new Map(theirs.map((s) => [s.ref, s.status.toUpperCase()]))
  const issues: SubscriptionIssue[] = []
  let matched = 0
  for (const o of ours) {
    const status = byRef.get(o.ref)
    if (status === undefined) issues.push({ kind: "missingAtProvider", ref: o.ref, ours: o.status, theirs: null })
    else if (status !== o.status.toUpperCase()) issues.push({ kind: "statusMismatch", ref: o.ref, ours: o.status, theirs: status })
    else matched++
  }
  const known = new Set(ours.map((o) => o.ref))
  for (const [ref, status] of byRef) {
    if (!known.has(ref) && LIVE_SUBSCRIPTION.has(status)) issues.push({ kind: "missingInRecords", ref, ours: null, theirs: status })
  }
  return { matched, issues }
}
