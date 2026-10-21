import { NextResponse } from "next/server"
import { handleInbound } from "@/lib/outreach-agent/agent"
import { inboundConfigured, verifyInbound } from "@/lib/outreach-agent/mailer"
import { salsoxOutreach } from "@/lib/outreach-agent/site"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Replies to outreach emails, from Resend's inbound email on the outreach
 * domain: Resend posts `email.received` here, signed with
 * OUTREACH_INBOUND_WEBHOOK_SECRET (Resend dashboard, Webhooks). The signature
 * is checked before anything is read; the email itself is then fetched by id
 * and handed to Leo (agent.ts handleInbound), which labels it and stops any
 * follow-up still pending for that lead.
 *
 * Answers 200 to every verified event, including ones it ignores, so Resend
 * does not retry them; 401 to anything unsigned.
 */
export async function POST(request: Request) {
  if (!inboundConfigured()) return NextResponse.json({ error: "Inbound replies are not configured." }, { status: 503 })
  const payload = await request.text()
  const event = verifyInbound(payload, {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  })
  if (!event) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })
  if (event.type !== "email.received") return NextResponse.json({ ignored: event.type })
  const emailId = typeof event.data.email_id === "string" ? event.data.email_id : null
  if (!emailId) return NextResponse.json({ ignored: "no email id" })
  const result = await handleInbound(salsoxOutreach, emailId)
  return NextResponse.json(result)
}
