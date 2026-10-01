import { describe, it, expect } from "vitest"

import { customerRow, customerTotals, parseCustomerSort, sortCustomers, type CustomerInput } from "./admin-customers"

const base: CustomerInput = {
  id: "u1",
  email: "ama@example.com",
  name: "Ama",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  plan: null,
  documents: [],
  payments: [],
}

describe("customerRow", () => {
  it("counts sent documents but not drafts, and the completion rate", () => {
    const row = customerRow({
      ...base,
      documents: [
        { status: "DRAFT", count: 4 },
        { status: "PENDING", count: 2 },
        { status: "COMPLETED", count: 6 },
        { status: "EXPIRED", count: 2 },
      ],
    })
    expect(row.documentsSent).toBe(10)
    expect(row.documentsCompleted).toBe(6)
    expect(row.completionRate).toBeCloseTo(0.6)
  })

  it("has no completion rate before anything was sent", () => {
    expect(customerRow(base).completionRate).toBeNull()
  })

  it("turns the plan into monthly revenue, yearly plans divided by twelve", () => {
    expect(customerRow({ ...base, plan: { name: "Business", price: 1900, interval: "MONTH" } }).monthlyRevenue).toBe(1900)
    expect(customerRow({ ...base, plan: { name: "Business Yearly", price: 19000, interval: "YEAR" } }).monthlyRevenue).toBeCloseTo(1583, 0)
  })

  // Different currencies are never added together.
  it("keeps Sign & Pay money per currency, separating refunds and ignoring the unpaid", () => {
    const row = customerRow({
      ...base,
      payments: [
        { currency: "GHS", status: "PAID", amount: 50000, count: 2 },
        { currency: "USD", status: "PAID", amount: 2500, count: 1 },
        { currency: "GHS", status: "REFUNDED", amount: 10000, count: 1 },
        { currency: "USD", status: "PENDING", amount: 9999, count: 1 },
      ],
    })
    expect(row.collected).toEqual({ GHS: 50000, USD: 2500 })
    expect(row.refunded).toEqual({ GHS: 10000 })
  })
})

describe("sortCustomers", () => {
  const a = { ...customerRow({ ...base, id: "a", email: "a@x.com", documents: [{ status: "COMPLETED", count: 1 }] }), paidCount: 5 }
  const b = { ...customerRow({ ...base, id: "b", email: "b@x.com", plan: { name: "B", price: 1900, interval: "MONTH" }, documents: [{ status: "COMPLETED", count: 9 }] }), paidCount: 0 }

  it("orders by the chosen figure, largest first", () => {
    expect(sortCustomers([a, b], "documents").map((r) => r.id)).toEqual(["b", "a"])
    expect(sortCustomers([a, b], "volume").map((r) => r.id)).toEqual(["a", "b"])
    expect(sortCustomers([a, b], "revenue").map((r) => r.id)).toEqual(["b", "a"])
  })

  it("falls back to documents for an unknown sort", () => {
    expect(parseCustomerSort("drop table")).toBe("documents")
    expect(parseCustomerSort("volume")).toBe("volume")
  })
})

describe("customerTotals", () => {
  it("adds up revenue, documents and per-currency volume", () => {
    const rows = [
      customerRow({ ...base, plan: { name: "P", price: 900, interval: "MONTH" }, documents: [{ status: "COMPLETED", count: 2 }], payments: [{ currency: "GHS", status: "PAID", amount: 100, count: 1 }] }),
      customerRow({ ...base, id: "u2", documents: [{ status: "PENDING", count: 2 }], payments: [{ currency: "GHS", status: "PAID", amount: 50, count: 1 }] }),
    ]
    expect(customerTotals(rows)).toMatchObject({
      customers: 2,
      payingCustomers: 1,
      monthlyRevenue: 900,
      documentsSent: 4,
      documentsCompleted: 2,
      completionRate: 0.5,
      collected: { GHS: 150 },
    })
  })
})
