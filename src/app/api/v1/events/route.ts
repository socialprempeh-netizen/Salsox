/**
 * GET /api/v1/events?event=document.completed&limit=3: the account's latest
 * real events of one kind, newest first, each exactly as a webhook would
 * carry it, as an array. Empty when nothing has happened yet.
 *
 * For integration platforms building a workflow: Zapier's "perform list" for
 * an instant trigger should show the user's own recent data, and falls back
 * to /api/v1/webhooks/sample when this is empty. Also usable as a polling
 * trigger. Built by recentEvents (src/lib/webhooks/store.ts).
 */
import { NextResponse } from "next/server"
import { apiError, withApiKey } from "@/lib/api/v1"
import { isWebhookEvent } from "@/lib/webhooks/events"
import { recentEvents, RECENT_EVENTS_MAX } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  return withApiKey(request, async (caller) => {
    const params = new URL(request.url).searchParams
    const event = params.get("event") ?? ""
    if (!isWebhookEvent(event)) return apiError(422, "events", "Give `event`, one of: document.sent, document.viewed, document.signed, document.completed, payment.sent, document.declined, document.expired.")
    const rawLimit = params.get("limit")
    const limit = rawLimit === null ? 3 : Number(rawLimit)
    if (!Number.isInteger(limit) || limit < 1 || limit > RECENT_EVENTS_MAX) return apiError(422, "invalid_input", `\`limit\` must be a whole number from 1 to ${RECENT_EVENTS_MAX}.`)
    return NextResponse.json(await recentEvents(caller.userId, event, limit))
  })
}
