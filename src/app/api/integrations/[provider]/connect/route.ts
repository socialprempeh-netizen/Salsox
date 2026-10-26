/**
 * GET /api/integrations/{hubspot|salesforce}/connect: starts connecting the
 * signed-in account to HubSpot or a Salesforce org (Salsox as the OAuth
 * client; src/lib/integrations).
 *
 * Makes a signed state for this user (oauth-state.ts), keeps its nonce, and
 * for Salesforce a PKCE verifier, in an httpOnly cookie for ten minutes, and
 * sends the browser to the provider's authorize page. `?sandbox=1` connects
 * a Salesforce sandbox instead of a production org. A provider without its
 * credentials is a 404: it is not offered on this deployment.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { createState, pkcePair, STATE_COOKIE, STATE_TTL_MS, stateCookieValue } from "@/lib/integrations/oauth-state"
import { hubspotAuthorizeUrl, hubspotConfig, integrationCallbackUrl } from "@/lib/integrations/hubspot"
import { salesforceAuthorizeUrl, salesforceConfig } from "@/lib/integrations/salesforce"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/login", req.url))
  const secret = process.env.AUTH_SECRET
  if (!secret) return new NextResponse(null, { status: 503 })
  const redirectUri = integrationCallbackUrl(siteConfig.url, provider)

  let url: string
  let cookie: string
  if (provider === "hubspot") {
    const config = hubspotConfig()
    if (!config) return new NextResponse(null, { status: 404 })
    const { state, nonce } = createState({ provider, userId: user.id, secret })
    url = hubspotAuthorizeUrl({ config, redirectUri, state })
    cookie = stateCookieValue(nonce)
  } else if (provider === "salesforce") {
    const config = salesforceConfig()
    if (!config) return new NextResponse(null, { status: 404 })
    const sandbox = req.nextUrl.searchParams.get("sandbox") === "1"
    const { state, nonce } = createState({ provider, userId: user.id, secret, extra: { sandbox } })
    const pkce = pkcePair()
    url = salesforceAuthorizeUrl({ config, sandbox, redirectUri, state, codeChallenge: pkce.challenge })
    cookie = stateCookieValue(nonce, pkce.verifier)
  } else {
    return new NextResponse(null, { status: 404 })
  }

  const res = NextResponse.redirect(url)
  res.cookies.set(STATE_COOKIE, cookie, { maxAge: STATE_TTL_MS / 1000, path: "/api/integrations", sameSite: "lax", secure: req.nextUrl.protocol === "https:", httpOnly: true })
  return res
}
