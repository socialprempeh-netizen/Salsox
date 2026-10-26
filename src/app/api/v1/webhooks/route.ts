/**
 * /api/v1/webhooks: an integration's subscriptions, in the "REST hooks"
 * pattern Zapier and Make use. When someone turns a Zap on, the platform
 * POSTs here with its own URL and the event it wants; when they turn it off,
 * it DELETEs /api/v1/webhooks/{id}.
 *
 *   GET   list this account's endpoints (secrets never included)
 *   POST  { "url" | "target_url", "events": [...] | "event": "..." }
 *         → 201 { id, url, events, secret }  (the secret, this once)
 *
 * Endpoints made here are marked source "api" and appear on the Developers
 * page beside the ones made there, under the same rules (src/lib/webhooks).
 */
import { NextResponse } from "next/server"
import { apiError, jsonBody, withScope } from "@/lib/api/v1"
import { createEndpoint, listEndpoints, type EndpointError } from "@/lib/webhooks/store"

export const dynamic = "force-dynamic"

const MESSAGES: Record<EndpointError, string> = {
  invalid: "`url` is not a valid URL.",
  https: "`url` must use https.",
  credentials: "`url` must not contain a user name or password.",
  private: "`url` points at a private or local address.",
  port: "`url` uses a port that is not allowed.",
  length: "`url` is too long.",
  events: "Give at least one known event: document.sent, document.viewed, document.signed, document.completed, payment.sent, document.declined, document.expired.",
  limit: "This account has the most webhook endpoints it can have. Remove one first.",
  notFound: "Not found.",
}

export async function GET(request: Request) {
  return withScope("webhooks:manage", request, async (caller) => {
    const endpoints = await listEndpoints(caller.userId)
    return NextResponse.json({
      data: endpoints.map((e) => ({ id: e.id, url: e.url, events: e.events, enabled: e.enabled, source: e.source, created_at: e.createdAt.toISOString() })),
    })
  })
}

export async function POST(request: Request) {
  return withScope("webhooks:manage", request, async (caller) => {
    const body = await jsonBody(request)
    if (!body) return apiError(400, "invalid_json", "Send a JSON object.")
    const url = typeof body.url === "string" ? body.url : typeof body.target_url === "string" ? body.target_url : ""
    const events = Array.isArray(body.events) ? body.events : typeof body.event === "string" ? [body.event] : []
    const created = await createEndpoint(caller.userId, { url, events, description: typeof body.description === "string" ? body.description : null, source: "api" })
    if (!created.ok) return apiError(created.error === "limit" ? 409 : 422, created.error, MESSAGES[created.error])
    return NextResponse.json({ id: created.id, url: created.url, events: created.events, secret: created.secret }, { status: 201 })
  })
}
