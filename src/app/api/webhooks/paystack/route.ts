/**
 * Paystack webhook for Sign & Pay: POST /api/webhooks/paystack.
 *
 * The signature (HMAC-SHA512 of the raw body) is checked first. Even then the
 * body is not trusted for the outcome: `confirmPayment` asks Paystack's verify
 * endpoint directly and matches amount and currency before marking anything
 * paid. Unknown references are acknowledged with 200 so Paystack stops
 * retrying events that are not ours.
 */
import { NextResponse } from "next/server"
import { verifyPaystackSignature } from "@/lib/esign/payments/paystack"
import { confirmPayment, paymentIdByRef } from "@/lib/esign/signing"

export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: { event?: string; data?: { reference?: string } }
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (event.event === "charge.success" && event.data?.reference) {
    const paymentId = await paymentIdByRef(event.data.reference)
    if (paymentId) {
      try {
        await confirmPayment(paymentId)
      } catch (error) {
        console.error("[paystack] confirm failed", error)
        // 500 makes Paystack retry later, which is what we want here.
        return NextResponse.json({ error: "Confirmation failed" }, { status: 500 })
      }
    }
  }
  return NextResponse.json({ received: true })
}
