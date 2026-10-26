/**
 * What every public API route (/api/v1) shares: authenticating the caller by
 * API key (src/lib/api-keys-store.ts), a per-key rate limit, and one shape
 * for errors, `{ "error": { "code", "message" } }`, so an integration can
 * branch on `code` and show `message`.
 *
 * The API exists for integrations (Zapier, Make, HubSpot): subscribing to
 * webhooks the way their "REST hooks" expect, checking a key works, and
 * since the documents routes, sending documents and finding them.
 *
 * A caller is an API key (every route) or, for integrations that must use
 * OAuth (the Salesforce package), an access token from Salsox's OAuth
 * server (src/lib/oauth-server), which may use only the routes its granted
 * scopes cover: withScope names the scope a route needs.
 * Described for developers in docs/webhooks.md and the Help Center article.
 */
import { NextResponse } from "next/server"
import { authenticateApiRequest, type ApiCaller } from "@/lib/api-keys-store"
import { bearerAccessToken, scopeAllows, type OAuthScope } from "@/lib/oauth-server/rules"
import { authenticateOAuthToken } from "@/lib/oauth-server/store"
import { checkRateLimit } from "@/lib/rate-limit"

/** Requests per key per minute: ample for a polling or subscribing integration. */
const PER_MINUTE = 120

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}

/** An API key's caller has no scopes (it may use everything); an OAuth caller has its grant's. */
export type Caller = ApiCaller & { scopes?: OAuthScope[]; grantId?: string }

/** Runs `handler` for an authenticated, under-limit caller; answers 401 or 429 otherwise. */
export async function withApiKey(request: Request, handler: (caller: Caller) => Promise<Response>, scope: OAuthScope | null = null): Promise<Response> {
  // Was: const caller = await authenticateApiRequest(request.headers)
  const token = bearerAccessToken(request.headers)
  const caller: Caller | null = token ? await authenticateOAuthToken(token) : await authenticateApiRequest(request.headers)
  if (!caller) {
    return apiError(401, "unauthorized", "Send a valid API key as `Authorization: Bearer <key>`.", { "www-authenticate": 'Bearer realm="api"' })
  }
  if (!(await checkRateLimit(`api:${caller.keyId}`, PER_MINUTE, 60_000))) {
    return apiError(429, "rate_limited", `Over ${PER_MINUTE} requests a minute for this key. Wait and try again.`, { "retry-after": "60" })
  }
  if (!scopeAllows(caller.scopes, scope)) {
    return apiError(403, "insufficient_scope", `This connection was not granted \`${scope}\`. Connect again and allow it.`)
  }
  return handler(caller)
}

/** withApiKey for a route that needs `scope` when the caller is an OAuth token. */
export function withScope(scope: OAuthScope, request: Request, handler: (caller: Caller) => Promise<Response>): Promise<Response> {
  return withApiKey(request, handler, scope)
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
