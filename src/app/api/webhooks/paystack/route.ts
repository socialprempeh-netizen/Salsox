/**
 * Paystack webhook for Sign & Pay: POST /api/webhooks/paystack.
 *
 * The signature (HMAC-SHA512 of the raw body) is checked first. Even then the
 * body is not trusted for the outcome: `confirmPayment` asks Paystack's verify
 * endpoint directly and matches amount and currency before marking anything
 * paid. Unknown references are acknowledged with 200 so Paystack stops
 * retrying events that are not ours.
 *
 * Refunds and disputes are recorded too (payments/settle.ts): a refund made
 * from the Paystack dashboard, and a chargeback opened or resolved by the
 * payer's bank. Those are records of what happened, so they are written from
 * the signed event without a second lookup.
 */
import { NextResponse } from "next/server"
import { verifyPaystackSignature } from "@/lib/esign/payments/paystack"
import { confirmPayment, paymentIdByRef } from "@/lib/esign/signing"
import { recordDispute, recordProviderRefund } from "@/lib/esign/payments/settle"

type PaystackEvent = {
  event?: string
  data?: {
    id?: number | string
    reference?: string
    amount?: number
    refund_amount?: number
    resolution?: string
    transaction_reference?: string
    transaction?: { reference?: string }
  }
}

/** The transaction a refund or dispute event is about; Paystack nests it differently per event. */
const transactionRef = (data: PaystackEvent["data"]) => data?.transaction_reference ?? data?.transaction?.reference ?? data?.reference

export async function POST(req: Request) {
  const raw = await req.text()
  if (!verifyPaystackSignature(raw, req.headers.get("x-paystack-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  }

  let event: PaystackEvent
  try {
    event = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const ref = transactionRef(event.data)
  try {
    if (event.event === "refund.processed" && ref && event.data?.amount !== undefined) {
      await recordProviderRefund({ find: { providerRef: ref }, eventKey: `paystack-refund:${event.data.id ?? ref}`, amount: event.data.amount })
    }
    if ((event.event === "charge.dispute.create" || event.event === "charge.dispute.resolve") && ref) {
      const resolved = event.event === "charge.dispute.resolve"
      await recordDispute({
        find: { providerRef: ref },
        disputeId: String(event.data?.id ?? ref),
        stage: resolved ? "closed" : "opened",
        // "merchant-accepted" means the payer got the money back.
        outcome: resolved ? (event.data?.resolution === "merchant-accepted" ? "lost" : "won") : undefined,
        amount: event.data?.refund_amount ?? event.data?.amount,
      })
    }
  } catch (error) {
    console.error("[paystack] refund or dispute could not be recorded", error)
    return NextResponse.json({ error: "Recording failed" }, { status: 500 })
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
