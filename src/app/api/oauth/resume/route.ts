/**
 * GET /api/oauth/resume?to=/oauth/authorize?…: the way a signed-out visitor
 * to the consent page signs in and comes back to it.
 *
 * Sign-in always lands on /dashboard (every method: password, Google,
 * passkey, two-factor). So the consent page's address is kept in a short,
 * httpOnly cookie, and the proxy (src/proxy.ts), seeing a signed-in request
 * for /dashboard with that cookie, sends it back to the consent page once.
 * Only the consent page itself can be kept (resumablePath), so this cannot
 * be turned into an open redirect.
 */
import { NextResponse, type NextRequest } from "next/server"
import { OAUTH_RESUME_COOKIE, OAUTH_RESUME_MINUTES } from "@/lib/oauth-server/resume"
import { resumablePath } from "@/lib/oauth-server/rules"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const to = resumablePath(req.nextUrl.searchParams.get("to"))
  const res = NextResponse.redirect(new URL("/login", req.url), 303)
  if (to) res.cookies.set(OAUTH_RESUME_COOKIE, to, { maxAge: OAUTH_RESUME_MINUTES * 60, path: "/", sameSite: "lax", secure: req.nextUrl.protocol === "https:", httpOnly: true })
  return res
}
