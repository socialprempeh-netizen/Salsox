/**
 * Draws a receipt (receipts.ts) as a one-page A4 PDF.
 *
 * Built with pdf-lib, which the signing engine already ships, so a receipt
 * costs no new dependency and no headless browser. Every word on the page
 * arrives in `labels` from the message file: this file decides layout, not
 * wording. Amounts are written with the currency code ("GHS 120.00"), because
 * the standard PDF fonts cannot draw every currency symbol.
 *
 * Pure: bytes out for data in, which is what lets the test beside it open the
 * result and check it.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { toWinAnsi } from "@/lib/esign/pdf/seal"
import { formatAmount, type Receipt } from "./receipts"

export type ReceiptLabels = {
  title: string
  paid: string
  refunded: string
  number: string
  date: string
  method: string
  reference: string
  billedTo: string
  from: string
  description: string
  amount: string
  total: string
  amountPaid: string
  refundNote: string
  footer: string
}

export type ReceiptSeller = { name: string; url: string; email: string }

const INK = rgb(0.06, 0.09, 0.16)
const MUTED = rgb(0.39, 0.45, 0.55)
const RULE = rgb(0.86, 0.88, 0.91)
const GREEN = rgb(0.02, 0.47, 0.34)
const AMBER = rgb(0.71, 0.33, 0.04)

export async function renderReceiptPdf(
  receipt: Receipt,
  seller: ReceiptSeller,
  labels: ReceiptLabels,
  options: { locale?: string; formatDate: (date: Date) => string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const [W, H] = [595.28, 841.89]
  const margin = 56
  const page = doc.addPage([W, H])
  const money = (minor: number) => formatAmount(minor, receipt.currency, options.locale, "code")

  const text = (p: PDFPage, value: string, x: number, y: number, opts: { font?: PDFFont; size?: number; color?: typeof INK; maxWidth?: number } = {}) => {
    const font = opts.font ?? regular
    const size = opts.size ?? 10
    let safe = toWinAnsi(value)
    // Shorten rather than overflow a column. Three dots, not "…", which the
    // standard fonts' encoding (toWinAnsi) would turn into "?".
    if (opts.maxWidth && font.widthOfTextAtSize(safe, size) > opts.maxWidth) {
      while (safe.length > 1 && font.widthOfTextAtSize(`${safe}...`, size) > opts.maxWidth) safe = safe.slice(0, -1)
      safe = `${safe.trimEnd()}...`
    }
    p.drawText(safe, { x, y, size, font, color: opts.color ?? INK })
  }
  const right = (value: string, xRight: number, y: number, opts: { font?: PDFFont; size?: number; color?: typeof INK } = {}) => {
    const font = opts.font ?? regular
    const size = opts.size ?? 10
    const safe = toWinAnsi(value)
    page.drawText(safe, { x: xRight - font.widthOfTextAtSize(safe, size), y, size, font, color: opts.color ?? INK })
  }
  const rule = (y: number) => page.drawLine({ start: { x: margin, y }, end: { x: W - margin, y }, thickness: 0.75, color: RULE })

  // Header: who issued it, what it is, and whether the money stayed.
  let y = H - margin
  text(page, seller.name, margin, y - 4, { font: bold, size: 20, maxWidth: 300 })
  right(labels.title, W - margin, y - 4, { font: bold, size: 20 })
  y -= 26
  text(page, seller.url, margin, y, { color: MUTED, size: 9 })
  const refunded = receipt.status === "refunded"
  const stamp = refunded ? labels.refunded : labels.paid
  const stampWidth = bold.widthOfTextAtSize(stamp, 10) + 16
  page.drawRectangle({ x: W - margin - stampWidth, y: y - 5, width: stampWidth, height: 18, borderColor: refunded ? AMBER : GREEN, borderWidth: 1.25 })
  right(stamp, W - margin - 8, y, { font: bold, color: refunded ? AMBER : GREEN })
  y -= 36

  // Facts, two columns.
  const facts: [string, string][] = [
    [labels.number, receipt.number],
    [labels.date, options.formatDate(receipt.issuedAt)],
    [labels.method, receipt.provider],
    [labels.reference, receipt.reference],
  ]
  for (const [label, value] of facts) {
    text(page, label, margin, y, { color: MUTED, size: 9 })
    text(page, value, margin + 110, y, { size: 9, maxWidth: W - 2 * margin - 110 })
    y -= 15
  }
  y -= 14

  // Parties.
  const colX = margin + (W - 2 * margin) / 2
  text(page, labels.billedTo, margin, y, { font: bold, size: 9, color: MUTED })
  text(page, labels.from, colX, y, { font: bold, size: 9, color: MUTED })
  y -= 15
  text(page, receipt.billedTo.name ?? receipt.billedTo.email ?? "-", margin, y, { font: bold, maxWidth: colX - margin - 12 })
  text(page, seller.name, colX, y, { font: bold, maxWidth: W - margin - colX })
  y -= 14
  if (receipt.billedTo.name && receipt.billedTo.email) text(page, receipt.billedTo.email, margin, y, { size: 9, color: MUTED, maxWidth: colX - margin - 12 })
  text(page, seller.email, colX, y, { size: 9, color: MUTED, maxWidth: W - margin - colX })
  y -= 34

  // Lines.
  page.drawRectangle({ x: margin, y: y - 6, width: W - 2 * margin, height: 22, color: rgb(0.96, 0.97, 0.98) })
  text(page, labels.description, margin + 8, y, { font: bold, size: 9, color: MUTED })
  right(labels.amount, W - margin - 8, y, { font: bold, size: 9, color: MUTED })
  y -= 26
  for (const line of receipt.lines) {
    text(page, line.label, margin + 8, y, { maxWidth: W - 2 * margin - 140 })
    right(money(line.amount), W - margin - 8, y)
    y -= 20
    rule(y + 8)
  }
  for (const line of receipt.adjustments) {
    text(page, line.label, margin + 8, y, { color: MUTED })
    right(money(line.amount), W - margin - 8, y, { color: MUTED })
    y -= 20
  }
  y -= 6
  text(page, labels.total, W - margin - 220, y, { font: bold, size: 12 })
  right(money(receipt.total), W - margin - 8, y, { font: bold, size: 12 })
  y -= 18
  text(page, labels.amountPaid, W - margin - 220, y, { color: MUTED })
  right(money(receipt.total), W - margin - 8, y, { color: MUTED })
  y -= 30

  if (refunded) {
    text(page, labels.refundNote, margin, y, { color: AMBER, size: 9, maxWidth: W - 2 * margin })
  }

  // Footer.
  page.drawLine({ start: { x: margin, y: margin + 24 }, end: { x: W - margin, y: margin + 24 }, thickness: 0.75, color: RULE })
  text(page, labels.footer, margin, margin + 8, { size: 8, color: MUTED, maxWidth: W - 2 * margin })

  doc.setTitle(`${labels.title} ${receipt.number}`)
  doc.setProducer(seller.name)
  doc.setCreationDate(receipt.issuedAt)
  return doc.save()
}
