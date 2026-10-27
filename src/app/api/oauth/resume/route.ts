/**
 * GET /api/oauth/resume?to=/oauth/authorize?…: the way a signed-out visitor
 * to the consent page signs in and comes back to it.
 *
 * Sign-in always lands on /dashboard (every method: password, Google,
 * passkey, two-factor). So the consent page's address is kept in a short,
 * httpOnly cookie; the dashboard layout, seeing it, sends the browser to
 * `?continue=1` here, which clears it and returns to the consent page once.
 * (The proxy did this first, but a sign-in action's redirect is rendered in
 * the same response and never reaches the proxy.)
 * Only the consent page itself can be kept (resumablePath), so this cannot
 * be turned into an open redirect.
 */
import { NextResponse, type NextRequest } from "next/server"
import { OAUTH_RESUME_COOKIE, OAUTH_RESUME_MINUTES } from "@/lib/oauth-server/resume"
import { resumablePath } from "@/lib/oauth-server/rules"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("continue") === "1") {
    const back = NextResponse.redirect(new URL(resumablePath(req.cookies.get(OAUTH_RESUME_COOKIE)?.value) ?? "/dashboard", req.url), 303)
    back.cookies.delete(OAUTH_RESUME_COOKIE)
    return back
  }
  const to = resumablePath(req.nextUrl.searchParams.get("to"))
  const res = NextResponse.redirect(new URL("/login", req.url), 303)
  if (to) res.cookies.set(OAUTH_RESUME_COOKIE, to, { maxAge: OAUTH_RESUME_MINUTES * 60, path: "/", sameSite: "lax", secure: req.nextUrl.protocol === "https:", httpOnly: true })
  return res
}
