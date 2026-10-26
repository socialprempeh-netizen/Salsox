/**
 * GET /api/integrations/{hubspot|salesforce}/callback: where HubSpot or
 * Salesforce sends the browser back after the person approves (or not).
 *
 * Trusted only with a state this flow signed, for the signed-in user, in
 * the browser that started it (checkState). The code is then exchanged and
 * the connection stored (hubspot-store.ts, salesforce-store.ts). The
 * browser always lands on the Developers page, with `connected=` or
 * `integrationError=` for it to say what happened. Provider error details
 * are not echoed: they could carry anything.
 */
import { NextResponse, type NextRequest } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { checkState, readStateCookie, STATE_COOKIE } from "@/lib/integrations/oauth-state"
import { completeHubSpotConnection } from "@/lib/integrations/hubspot-store"
import { integrationCallbackUrl } from "@/lib/integrations/hubspot"
import { completeSalesforceConnection } from "@/lib/integrations/salesforce-store"
import { siteConfig } from "@/config/site"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params
  const back = (query: Record<string, string>) => {
    const res = NextResponse.redirect(new URL(`/dashboard/developers?${new URLSearchParams(query)}#integrations`, req.url))
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/integrations" })
    return res
  }
  if (provider !== "hubspot" && provider !== "salesforce") return new NextResponse(null, { status: 404 })
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL("/login", req.url))
  const secret = process.env.AUTH_SECRET
  if (!secret) return back({ integrationError: provider })

  const q = req.nextUrl.searchParams
  // Declined at the provider, or any error it reports.
  if (q.get("error")) return back({ integrationError: provider, reason: "declined" })
  const cookie = readStateCookie(req.cookies.get(STATE_COOKIE)?.value)
  const state = checkState({ state: q.get("state"), provider, userId: user.id, cookieNonce: cookie.nonce, secret })
  const code = q.get("code")
  if (!state.ok || !code || code.length > 2048) return back({ integrationError: provider, reason: "state" })

  try {
    if (provider === "hubspot") {
      await completeHubSpotConnection({ userId: user.id, code, redirectUri: integrationCallbackUrl(siteConfig.url, provider) })
    } else {
      if (!cookie.verifier) return back({ integrationError: provider, reason: "state" })
      await completeSalesforceConnection({ userId: user.id, code, verifier: cookie.verifier, sandbox: state.payload.x?.sandbox === true })
    }
  } catch (error) {
    console.warn(`[integrations] ${provider} connection failed`, error instanceof Error ? error.message : "unknown error")
    return back({ integrationError: provider })
  }
  return back({ connected: provider })
}
