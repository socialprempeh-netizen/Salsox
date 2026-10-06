/**
 * Tests for the receipt model (receipts.ts): each source becomes the same
 * shape, only money that moved gets a receipt, and the history is newest
 * first.
 */
import { describe, expect, it } from "vitest"
import {
  formatAmount,
  receiptFilename,
  receiptFromInvoice,
  receiptFromPurchase,
  receiptFromSignAndPay,
  receiptHref,
  receiptNumber,
  sortReceipts,
  type InvoiceSource,
  type SignAndPaySource,
} from "./receipts"

const labels = {
  subscription: "Subscription",
  discount: "Discount",
  tax: "Tax",
  purchase: (plan: string) => `${plan} (one-time)`,
  signAndPay: (title: string) => `Sign & Pay: ${title}`,
}

const invoice = (overrides: Partial<InvoiceSource> = {}): InvoiceSource => ({
  id: "in_123",
  number: "ABCD-0001",
  status: "paid",
  created: 1_790_000_000,
  currency: "usd",
  total: 1800,
  amount_paid: 1800,
  customer_name: "Ama Mensah",
  customer_email: "ama@example.com",
  status_transitions: { paid_at: 1_790_000_100 },
  lines: { data: [{ description: "Pro (monthly)", amount: 2000 }] },
  total_discount_amounts: [{ amount: 500 }],
  total_taxes: [{ amount: 300 }],
  ...overrides,
})

const payment = (overrides: Partial<SignAndPaySource> = {}): SignAndPaySource => ({
  id: "cmpay0000000000000000abcd",
  provider: "PAYSTACK",
  providerRef: "ref_9",
  amount: 25000,
  currency: "GHS",
  status: "PAID",
  paidAt: new Date("2026-09-30T10:00:00Z"),
  createdAt: new Date("2026-09-29T10:00:00Z"),
  document: { title: "Lease" },
  recipient: { name: "Kofi", email: "kofi@example.com" },
  ...overrides,
})

describe("receiptFromInvoice", () => {
  it("uses Stripe's number, the paid date, and shows discount and tax between lines and total", () => {
    const receipt = receiptFromInvoice(invoice(), labels)!
    expect(receipt.number).toBe("ABCD-0001")
    expect(receipt.issuedAt).toEqual(new Date(1_790_000_100 * 1000))
    expect(receipt.lines).toEqual([{ label: "Pro (monthly)", amount: 2000 }])
    expect(receipt.adjustments).toEqual([
      { label: "Discount", amount: -500 },
      { label: "Tax", amount: 300 },
    ])
    expect(receipt.total).toBe(1800)
    expect(receipt.provider).toBe("Stripe")
  })

  it("has no receipt for an invoice that was not paid", () => {
    for (const status of ["open", "draft", "void", "uncollectible", null]) {
      expect(receiptFromInvoice(invoice({ status }), labels)).toBeNull()
    }
  })
})

describe("receiptFromPurchase", () => {
  it("makes a paid or refunded receipt for a one-time purchase", () => {
    const base = {
      id: "cmpurchase00000000000wxyz",
      amount: 9900,
      currency: "usd",
      status: "COMPLETED" as const,
      createdAt: new Date("2026-08-01T00:00:00Z"),
      stripePaymentIntentId: "pi_1",
      plan: { name: "Lifetime" },
      user: { name: "Ama", email: "ama@example.com" },
    }
    expect(receiptFromPurchase(base, labels)).toMatchObject({ status: "paid", description: "Lifetime (one-time)", reference: "pi_1" })
    expect(receiptFromPurchase({ ...base, status: "REFUNDED" }, labels).status).toBe("refunded")
  })
})

describe("receiptFromSignAndPay", () => {
  it("covers Paystack as well as Stripe, made out to the signer who paid", () => {
    const receipt = receiptFromSignAndPay(payment(), labels)!
    expect(receipt.provider).toBe("Paystack")
    expect(receipt.billedTo).toEqual({ name: "Kofi", email: "kofi@example.com" })
    expect(receiptFromSignAndPay(payment({ provider: "STRIPE" }), labels)!.provider).toBe("Stripe")
  })

  it("has no receipt for money that never moved", () => {
    expect(receiptFromSignAndPay(payment({ status: "PENDING" }), labels)).toBeNull()
    expect(receiptFromSignAndPay(payment({ status: "FAILED" }), labels)).toBeNull()
  })
})

describe("helpers", () => {
  it("numbers receipts by date and record, stably", () => {
    expect(receiptNumber(new Date("2026-09-30T23:00:00Z"), "cmpay0000000000000000abcd")).toBe("R-20260930-0000ABCD")
  })

  it("builds a safe file name and the download path", () => {
    expect(receiptFilename({ number: "R-20260930-0000ABCD" })).toBe("receipt-R-20260930-0000ABCD.pdf")
    expect(receiptFilename({ number: "../../x y" })).toBe("receipt-xy.pdf")
    expect(receiptHref({ kind: "signAndPay", id: "abc" })).toBe("/api/billing/receipts/signAndPay/abc")
  })

  it("lists newest first and drops what has no receipt", () => {
    const older = receiptFromSignAndPay(payment({ id: "a", paidAt: new Date("2026-01-01") }), labels)
    const newer = receiptFromSignAndPay(payment({ id: "b", paidAt: new Date("2026-06-01") }), labels)
    expect(sortReceipts([older, null, newer]).map((r) => r.id)).toEqual(["b", "a"])
  })

  it("formats minor units for the currency, with the code for the PDF", () => {
    expect(formatAmount(1800, "usd")).toBe("$18.00")
    expect(formatAmount(1000, "jpy")).toBe("¥1,000")
    expect(formatAmount(25000, "GHS", "en", "code").replace(/\s/g, " ")).toBe("GHS 250.00")
  })
})
