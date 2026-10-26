/**
 * POST /api/oauth/revoke: token revocation (RFC 7009). A registered client
 * sends `token` (an access or refresh token); the connection it belongs to
 * ends, for every token of it. Answers 200 whether or not the token was
 * known, as the RFC asks, so it reveals nothing.
 */
import { NextResponse } from "next/server"
import { authenticateClient, oauthClients } from "@/lib/oauth-server/rules"
import { revokeToken } from "@/lib/oauth-server/store"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const body = new URLSearchParams(await request.text().catch(() => ""))
  const client = authenticateClient(request.headers, body, oauthClients())
  if (!client) return NextResponse.json({ error: "invalid_client", error_description: "Unknown client or wrong secret." }, { status: 401, headers: { "www-authenticate": 'Basic realm="oauth"' } })
  await revokeToken(body.get("token"), client)
  return new NextResponse(null, { status: 200, headers: { "cache-control": "no-store" } })
}
