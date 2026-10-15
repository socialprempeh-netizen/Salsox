/**
 * Tests for the revenue arithmetic (revenue.ts): currencies never mixed, a
 * payment never counted twice, conversion all-or-nothing, and reconciliation
 * flagging exactly the disagreements that matter.
 */
import { describe, expect, it } from "vitest"
import {
  convertTotals,
  parseFxTable,
  paystackStatus,
  reconcile,
  reconcileSubscriptions,
  revenueByKind,
  signAndPayVolume,
  statusesAgree,
  stripeSessionStatus,
  summarizePaystack,
  summarizeStripeBalance,
  totalsByCurrency,
  type RecordedPayment,
} from "./revenue"

describe("totals", () => {
  it("keeps currencies apart and normalises their codes", () => {
    expect(totalsByCurrency([{ currency: "usd", amount: 900 }, { currency: "GHS", amount: 5000 }, { currency: "USD", amount: 100 }])).toEqual({ USD: 1000, GHS: 5000 })
  })
})

describe("signAndPayVolume", () => {
  const payments: RecordedPayment[] = [
    { id: "p1", provider: "STRIPE", amount: 5000, currency: "usd", status: "PAID" },
    { id: "p2", provider: "PAYSTACK", amount: 20000, currency: "GHS", status: "PAID" },
    { id: "p3", provider: "STRIPE", amount: 5000, currency: "usd", status: "FAILED" },
    { id: "p4", provider: "PAYSTACK", amount: 1000, currency: "NGN", status: "REFUNDED" },
  ]

  it("keeps Stripe and Paystack separate, and combines only per currency", () => {
    const v = signAndPayVolume(payments)
    expect(v.byProvider.STRIPE.paid).toEqual({ USD: 5000 })
    expect(v.byProvider.PAYSTACK.paid).toEqual({ GHS: 20000 })
    expect(v.paid).toEqual({ USD: 5000, GHS: 20000 })
    expect(v.refunded).toEqual({ NGN: 1000 })
    expect(v.byProvider.STRIPE.counts).toEqual({ PENDING: 0, PAID: 1, FAILED: 1, REFUNDED: 0 })
  })

  it("never counts the same payment twice", () => {
    const v = signAndPayVolume([...payments, payments[0], payments[1]])
    expect(v.paid).toEqual({ USD: 5000, GHS: 20000 })
    expect(v.byProvider.STRIPE.counts.PAID).toBe(1)
  })

  it("counts a recipient who tried Stripe then paid with Paystack once, as Paystack volume", () => {
    const v = signAndPayVolume([
      { id: "try", provider: "STRIPE", amount: 20000, currency: "GHS", status: "FAILED" },
      { id: "paid", provider: "PAYSTACK", amount: 20000, currency: "GHS", status: "PAID" },
    ])
    expect(v.paid).toEqual({ GHS: 20000 })
    expect(v.byProvider.STRIPE.paid).toEqual({})
  })
})

describe("revenueByKind", () => {
  it("splits subscription, one-time and platform fees, each line once", () => {
    const r = revenueByKind([
      { id: "in_1", kind: "subscription", currency: "usd", amount: 900 },
      { id: "in_1", kind: "subscription", currency: "usd", amount: 900 },
      { id: "pi_1", kind: "oneTime", currency: "usd", amount: 9000 },
      { id: "fee_1", kind: "platformFee", currency: "ghs", amount: 150 },
    ])
    expect(r.subscription).toEqual({ USD: 900 })
    expect(r.oneTime).toEqual({ USD: 9000 })
    expect(r.platformFee).toEqual({ GHS: 150 })
    expect(r.total).toEqual({ USD: 9900, GHS: 150 })
  })
})

describe("convertTotals", () => {
  const fx = parseFxTable('{"base":"usd","asOf":"2026-10-15","rates":{"ghs":0.065}}')

  it("reads a rate table and converts with it", () => {
    expect(fx).toEqual({ base: "USD", asOf: "2026-10-15", rates: { GHS: 0.065 } })
    expect(convertTotals({ USD: 1000, GHS: 10000 }, fx)).toEqual({ currency: "USD", amount: 1650, asOf: "2026-10-15" })
  })

  it("gives no total when any currency lacks a rate, or there is no table", () => {
    expect(convertTotals({ USD: 1000, NGN: 50000 }, fx)).toBeNull()
    expect(convertTotals({ USD: 1000 }, null)).toBeNull()
  })

  it("rejects malformed tables rather than guessing", () => {
    expect(parseFxTable("not json")).toBeNull()
    expect(parseFxTable('{"base":"USD","asOf":"x","rates":{"GHS":-1}}')).toBeNull()
    expect(parseFxTable(undefined)).toBeNull()
  })
})

describe("provider summaries", () => {
  it("groups Stripe balance transactions, debits reported as positive figures", () => {
    const s = summarizeStripeBalance([
      { id: "t1", type: "charge", reportingCategory: "charge", amount: 5000, fee: 175, currency: "usd" },
      { id: "t1", type: "charge", reportingCategory: "charge", amount: 5000, fee: 175, currency: "usd" },
      { id: "t2", type: "refund", reportingCategory: "refund", amount: -1000, fee: 0, currency: "usd" },
      { id: "t3", type: "payout", reportingCategory: "payout", amount: -3000, fee: 0, currency: "usd" },
      { id: "t4", type: "transfer", reportingCategory: "transfer", amount: -4500, fee: 0, currency: "usd" },
      { id: "t5", type: "transfer_reversal", reportingCategory: "transfer_reversal", amount: 175, fee: 0, currency: "usd" },
    ])
    expect(s.gross).toEqual({ USD: 5000 })
    expect(s.fees).toEqual({ USD: 175 })
    expect(s.refunds).toEqual({ USD: 1000 })
    expect(s.payouts).toEqual({ USD: 3000 })
    expect(s.transfers).toEqual({ USD: 4325 })
  })

  it("sums successful Paystack volume and counts failures", () => {
    const s = summarizePaystack([
      { reference: "r1", status: "success", amount: 20000, fees: 390, currency: "GHS", platformShare: 200 },
      { reference: "r1", status: "success", amount: 20000, fees: 390, currency: "GHS", platformShare: 200 },
      { reference: "r2", status: "failed", amount: 5000, fees: 0, currency: "GHS" },
      { reference: "r3", status: "abandoned", amount: 5000, fees: 0, currency: "GHS" },
    ])
    expect(s).toEqual({ gross: { GHS: 20000 }, fees: { GHS: 390 }, platformShare: { GHS: 200 }, failed: 1, abandoned: 1 })
  })
})

describe("reconcile", () => {
  it("maps provider states onto ours", () => {
    expect(stripeSessionStatus({ status: "complete", paymentStatus: "paid", refunded: false })).toBe("PAID")
    expect(stripeSessionStatus({ status: "complete", paymentStatus: "paid", refunded: true })).toBe("REFUNDED")
    expect(stripeSessionStatus({ status: "expired", paymentStatus: "unpaid", refunded: false })).toBe("OPEN")
    expect(paystackStatus("success")).toBe("PAID")
    expect(paystackStatus("reversed")).toBe("REFUNDED")
    expect(paystackStatus("abandoned")).toBe("OPEN")
  })

  it("treats an unfinished checkout as agreement whether we still wait or gave up", () => {
    expect(statusesAgree("PENDING", "OPEN")).toBe(true)
    expect(statusesAgree("FAILED", "OPEN")).toBe(true)
    expect(statusesAgree("PENDING", "PAID")).toBe(false)
  })

  it("flags money taken but not recorded, records the provider lacks, and amount differences", () => {
    const { matched, issues } = reconcile(
      [
        { id: "a", ref: "cs_a", status: "PAID", amount: 5000, currency: "usd" },
        { id: "b", ref: "cs_b", status: "PENDING", amount: 5000, currency: "usd" },
        { id: "c", ref: "cs_c", status: "PAID", amount: 5000, currency: "usd" },
        { id: "d", ref: "cs_d", status: "PAID", amount: 5000, currency: "usd" },
        { id: "e", ref: "cs_e", status: "PENDING", amount: 5000, currency: "usd" },
      ],
      [
        { ref: "cs_a", status: "PAID", amount: 5000, currency: "USD" },
        { ref: "cs_b", status: "PAID", amount: 5000, currency: "USD" },
        { ref: "cs_c", status: "PAID", amount: 4000, currency: "USD" },
        { ref: "cs_x", status: "PAID", amount: 7000, currency: "USD" },
        { ref: "cs_y", status: "OPEN", amount: 7000, currency: "USD" },
      ]
    )
    expect(matched).toBe(1)
    expect(issues.map((i) => i.kind).sort()).toEqual(["amountMismatch", "missingAtProvider", "missingInRecords", "statusMismatch"])
  })
})

describe("reconcileSubscriptions", () => {
  it("compares statuses, and flags only live subscriptions we have no row for", () => {
    const { matched, issues } = reconcileSubscriptions(
      [
        { ref: "sub_a", status: "ACTIVE" },
        { ref: "sub_b", status: "ACTIVE" },
        { ref: "sub_c", status: "ACTIVE" },
      ],
      [
        { ref: "sub_a", status: "active" },
        { ref: "sub_b", status: "canceled" },
        { ref: "sub_x", status: "active" },
        { ref: "sub_old", status: "canceled" },
      ]
    )
    expect(matched).toBe(1)
    expect(issues).toEqual([
      { kind: "statusMismatch", ref: "sub_b", ours: "ACTIVE", theirs: "CANCELED" },
      { kind: "missingAtProvider", ref: "sub_c", ours: "ACTIVE", theirs: null },
      { kind: "missingInRecords", ref: "sub_x", ours: null, theirs: "ACTIVE" },
    ])
  })
})
