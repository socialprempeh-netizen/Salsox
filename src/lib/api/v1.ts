/**
 * What every public API route (/api/v1) shares: authenticating the caller by
 * API key (src/lib/api-keys-store.ts), a per-key rate limit, and one shape
 * for errors, `{ "error": { "code", "message" } }`, so an integration can
 * branch on `code` and show `message`.
 *
 * The API exists for integrations (Zapier, Make, HubSpot): subscribing to
 * webhooks the way their "REST hooks" expect, and checking a key works.
 * Described for developers in docs/webhooks.md and the Help Center article.
 */
import { NextResponse } from "next/server"
import { authenticateApiRequest, type ApiCaller } from "@/lib/api-keys-store"
import { checkRateLimit } from "@/lib/rate-limit"

/** Requests per key per minute: ample for a polling or subscribing integration. */
const PER_MINUTE = 120

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}

/** Runs `handler` for an authenticated, under-limit caller; answers 401 or 429 otherwise. */
export async function withApiKey(request: Request, handler: (caller: ApiCaller) => Promise<Response>): Promise<Response> {
  const caller = await authenticateApiRequest(request.headers)
  if (!caller) {
    return apiError(401, "unauthorized", "Send a valid API key as `Authorization: Bearer <key>`.", { "www-authenticate": 'Bearer realm="api"' })
  }
  if (!(await checkRateLimit(`api:${caller.keyId}`, PER_MINUTE, 60_000))) {
    return apiError(429, "rate_limited", `Over ${PER_MINUTE} requests a minute for this key. Wait and try again.`, { "retry-after": "60" })
  }
  return handler(caller)
}

/** The request body as JSON, or null when it is not JSON. */
export async function jsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
