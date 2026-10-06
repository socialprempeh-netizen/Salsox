/**
 * Tests for the receipt PDF (receipt-pdf.ts): it opens as a one-page PDF
 * whatever the receipt holds, including currencies and names the standard
 * fonts cannot draw.
 */
import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import { renderReceiptPdf, type ReceiptLabels } from "./receipt-pdf"
import type { Receipt } from "./receipts"

const labels: ReceiptLabels = {
  title: "Receipt",
  paid: "PAID",
  refunded: "REFUNDED",
  number: "Receipt number",
  date: "Date paid",
  method: "Paid through",
  reference: "Reference",
  billedTo: "BILLED TO",
  from: "FROM",
  description: "DESCRIPTION",
  amount: "AMOUNT",
  total: "Total",
  amountPaid: "Amount paid",
  refundNote: "Refunded.",
  footer: "Issued by Acme.",
}

const receipt: Receipt = {
  kind: "signAndPay",
  id: "p1",
  number: "R-20260930-0000ABCD",
  issuedAt: new Date("2026-09-30T10:00:00Z"),
  status: "paid",
  provider: "Paystack",
  description: "Sign & Pay: Ẹ̀kọ́ lease with a very long title that has to be shortened to fit its column on the page",
  lines: [{ label: "Sign & Pay: lease", amount: 25000 }],
  adjustments: [{ label: "Discount", amount: -500 }],
  total: 24500,
  currency: "NGN",
  billedTo: { name: "Ọlá Adé", email: "ola@example.com" },
  reference: "ref_9",
}

const seller = { name: "Acme", url: "https://acme.example", email: "hello@acme.example" }

describe("renderReceiptPdf", () => {
  it("produces a one-page PDF titled with the receipt number", async () => {
    const bytes = await renderReceiptPdf(receipt, seller, labels, { formatDate: (d) => d.toISOString().slice(0, 10) })
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    expect(doc.getTitle()).toBe("Receipt R-20260930-0000ABCD")
  })

  it("renders a refunded receipt too", async () => {
    const bytes = await renderReceiptPdf({ ...receipt, status: "refunded" }, seller, labels, { formatDate: () => "30 Sep 2026" })
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
  })
})
