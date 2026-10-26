/**
 * POST /api/oauth/token: the OAuth server's token endpoint (RFC 6749 §3.2).
 *
 * Form-encoded, from a registered client (HTTP Basic or client_secret_post):
 *   grant_type=authorization_code  code, redirect_uri, code_verifier (PKCE)
 *   grant_type=refresh_token       refresh_token (rotated: a new one comes back)
 *
 * Answers with access and refresh tokens, or an RFC error body. Never cached.
 * The rules are in src/lib/oauth-server/rules.ts, the grants in store.ts.
 */
import { NextResponse } from "next/server"
import { authenticateClient, oauthClients } from "@/lib/oauth-server/rules"
import { exchangeCode, refreshGrant } from "@/lib/oauth-server/store"
import { checkRateLimit } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" }

function oauthError(status: number, error: string, description: string, headers: Record<string, string> = {}) {
  return NextResponse.json({ error, error_description: description }, { status, headers: { ...NO_STORE, ...headers } })
}

export async function POST(request: Request) {
  const body = new URLSearchParams(await request.text().catch(() => ""))
  const client = authenticateClient(request.headers, body, oauthClients())
  if (!client) return oauthError(401, "invalid_client", "Unknown client or wrong secret.", { "www-authenticate": 'Basic realm="oauth"' })
  if (!(await checkRateLimit(`oauth-token:${client.id}`, 600, 60_000))) return oauthError(429, "slow_down", "Too many token requests. Wait a minute.")

  const grantType = body.get("grant_type")
  const result =
    grantType === "authorization_code"
      ? await exchangeCode({ code: body.get("code"), client, redirectUri: body.get("redirect_uri") ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : null), verifier: body.get("code_verifier") })
      : grantType === "refresh_token"
        ? await refreshGrant({ refreshToken: body.get("refresh_token"), client })
        : null
  if (!result) return oauthError(400, "unsupported_grant_type", "Use authorization_code or refresh_token.")
  if ("error" in result) return oauthError(400, result.error, result.description)
  return NextResponse.json(result, { headers: NO_STORE })
}
