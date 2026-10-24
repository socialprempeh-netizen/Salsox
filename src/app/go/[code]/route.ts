/**
 * An affiliate link, GET /go/{code}[?to=/pricing]: counts the visit, keeps
 * the affiliate's code in the sx_aff cookie, and sends the visitor on to a
 * page of this site (the rules are in src/lib/affiliates.ts).
 *
 * Every code redirects the same way, known or not, so the route cannot be
 * used to test which codes exist. Bots are redirected but not counted, and a
 * browser that already came through this link counts as a click but not as
 * a new visitor.
 *
 * Like an invite link, it records the visit as the signup's first touch
 * (sx_src) when none exists and the browser has not asked not to be tracked.
 */
import { NextResponse, type NextRequest } from "next/server"
import { AFFILIATE_COOKIE, AFFILIATE_COOKIE_DAYS, affiliateDestination, isBot, normalizeAffiliateCode } from "@/lib/affiliates"
import { recordAffiliateClick } from "@/lib/affiliates-store"
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_DAYS, buildTouch, serializeTouch } from "@/lib/seo/attribution"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeAffiliateCode((await params).code)
  const path = affiliateDestination(req.nextUrl.searchParams.get("to"))
  const res = NextResponse.redirect(new URL(path, req.url), 307)
  if (!code || isBot(req.headers.get("user-agent"))) return res

  let refHost: string | null = null
  try {
    const referer = req.headers.get("referer")
    const host = referer ? new URL(referer).hostname.toLowerCase() : ""
    refHost = host && host !== req.nextUrl.hostname ? host.slice(0, 100) : null
  } catch {
    refHost = null
  }
  const counted = await recordAffiliateClick(code, { path, refHost, unique: req.cookies.get(AFFILIATE_COOKIE)?.value !== code })
  if (!counted) return res

  const secure = req.nextUrl.protocol === "https:"
  res.cookies.set(AFFILIATE_COOKIE, code, { maxAge: AFFILIATE_COOKIE_DAYS * 86400, path: "/", sameSite: "lax", secure, httpOnly: true })

  const untracked = req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1"
  if (!untracked && !req.cookies.has(ATTRIBUTION_COOKIE)) {
    const touch = buildTouch({
      pathname: path,
      search: `?utm_source=${code}&utm_medium=affiliate`,
      referrer: req.headers.get("referer") ?? "",
      ownHost: req.nextUrl.hostname,
      now: new Date(),
    })
    // A raw header, as in src/app/invite/[code]/route.ts: cookies.set would
    // encode the already-encoded value a second time.
    res.headers.append(
      "Set-Cookie",
      `${ATTRIBUTION_COOKIE}=${serializeTouch(touch)}; Max-Age=${ATTRIBUTION_MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`
    )
  }
  return res
}
