/**
 * GET /api/v1/webhooks/sample?event=document.completed: a sample payload for
 * an event, as a one-item array. Integration platforms ask for one while a
 * user builds a workflow (Zapier's "perform list" for a REST hook trigger),
 * before any real event has happened. Same builder as real deliveries
 * (src/lib/webhooks/payload.ts), marked `test: true`.
 */
import { NextResponse } from "next/server"
import { siteConfig } from "@/config/site"
import { apiError, withScope } from "@/lib/api/v1"
import { isWebhookEvent } from "@/lib/webhooks/events"
import { samplePayload } from "@/lib/webhooks/payload"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withScope("webhooks:manage", request, async () => {
    const event = new URL(request.url).searchParams.get("event") ?? "document.completed"
    if (!isWebhookEvent(event)) return apiError(422, "events", "Unknown event. Use one of: document.sent, document.viewed, document.signed, document.completed, payment.sent, document.declined, document.expired.")
    return NextResponse.json([samplePayload(event, siteConfig.url)])
  })
}
