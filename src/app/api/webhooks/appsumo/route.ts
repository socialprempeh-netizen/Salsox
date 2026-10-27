/**
 * AppSumo licensing webhook: POST /api/webhooks/appsumo.
 *
 * Every change to a license arrives here: purchase, activate, upgrade,
 * downgrade, deactivate (a refund among them). The signature (HMAC-SHA256 of
 * the timestamp header and the raw body, keyed with APPSUMO_API_KEY) is
 * checked first; nothing unsigned reaches the database. The rules are in
 * src/lib/appsumo.ts, the writes in src/lib/appsumo-store.ts.
 *
 * Answered `{ event, success: true }` with 200 for every signed event,
 * including ones that change nothing (add-ons, a late retry), because AppSumo
 * keeps a license inactive until its activation is acknowledged. A failure to
 * record answers 500 so AppSumo retries. A test request is acknowledged
 * without being applied, as AppSumo's documentation asks.
 */
import { NextResponse } from "next/server"
import { appSumoConfig, readAppSumoEvent, verifyAppSumoWebhook, webhookSuccess } from "@/lib/appsumo"
import { applyAppSumoEvent } from "@/lib/appsumo-store"

export async function POST(req: Request) {
  const config = appSumoConfig()
  if (!config) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  const raw = await req.text()
  const signed = verifyAppSumoWebhook({
    apiKey: config.apiKey,
    timestamp: req.headers.get("x-appsumo-timestamp"),
    signature: req.headers.get("x-appsumo-signature"),
    rawBody: raw,
    now: Date.now(),
  })
  if (!signed) return NextResponse.json({ error: "Invalid signature" }, { status: 401 })

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const event = readAppSumoEvent(body)
  if (!event) return NextResponse.json({ error: "Unrecognised event" }, { status: 400 })
  if (event.test) return NextResponse.json(webhookSuccess(event.event, "Test received"))

  try {
    await applyAppSumoEvent(event)
  } catch (error) {
    console.error("[appsumo] event could not be recorded", error instanceof Error ? error.message : "unknown error")
    return NextResponse.json({ error: "Recording failed" }, { status: 500 })
  }
  return NextResponse.json(webhookSuccess(event.event))
}
