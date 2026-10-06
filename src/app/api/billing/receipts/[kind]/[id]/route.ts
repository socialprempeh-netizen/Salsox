/**
 * A PDF receipt for one past payment, downloaded from the billing page:
 *   GET /api/billing/receipts/invoice/{stripeInvoiceId}
 *   GET /api/billing/receipts/purchase/{purchaseId}
 *   GET /api/billing/receipts/signAndPay/{paymentId}
 *
 * Signed-in only (the proxy also guards /api/billing). Which receipts a user
 * may have is decided in src/lib/billing-receipts.ts, the same place the
 * billing page lists them from; anything else is a 404, never a 403, so the
 * route does not confirm that someone else's payment exists.
 */
import { NextResponse } from "next/server"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { loadReceipt } from "@/lib/billing-receipts"
import { RECEIPT_KINDS, receiptFilename, type ReceiptKind } from "@/lib/receipts"
import { renderReceiptPdf, type ReceiptLabels } from "@/lib/receipt-pdf"
import { contentDisposition } from "@/lib/esign/files"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { kind, id } = await params
  if (!RECEIPT_KINDS.includes(kind as ReceiptKind) || !id || id.length > 128) return new NextResponse(null, { status: 404 })

  const receipt = await loadReceipt(user.id, kind as ReceiptKind, id)
  if (!receipt) return new NextResponse(null, { status: 404 })

  const t = await getTranslations("receipts.pdf")
  const format = await getFormatter()
  const labels: ReceiptLabels = {
    title: t("title"),
    paid: t("paid"),
    refunded: t("refunded"),
    number: t("number"),
    date: t("date"),
    method: t("method"),
    reference: t("reference"),
    billedTo: t("billedTo"),
    from: t("from"),
    description: t("description"),
    amount: t("amount"),
    total: t("total"),
    amountPaid: t("amountPaid"),
    refundNote: t("refundNote"),
    footer: t("footer", { site: siteConfig.name, email: siteConfig.contactEmail }),
  }
  const bytes = await renderReceiptPdf(
    receipt,
    { name: siteConfig.name, url: siteConfig.url, email: siteConfig.contactEmail },
    labels,
    { formatDate: (date) => format.dateTime(date, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) },
  )

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(receiptFilename(receipt), "attachment"),
      "Cache-Control": "private, no-store",
    },
  })
}
