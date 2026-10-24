/**
 * An invite link, GET /invite/{code}: remembers who sent the visitor and
 * takes them to sign up (the referral rules are in src/lib/referrals.ts).
 *
 * The code goes in the first-party sx_ref cookie, read once when the account
 * is created. A code that does not belong to anyone is ignored there, so this
 * route does not look it up: it answers the same for every code and cannot be
 * used to test which ones exist.
 *
 * It also records the visit as the signup's first touch (sx_src), as a
 * referral, when no touch is recorded yet and the browser has not asked not
 * to be tracked: the signup page is not a public page, so the usual
 * first-touch script never runs on the way through here.
 */
import { NextResponse, type NextRequest } from "next/server"
import { normalizeReferralCode, REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referrals"
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_DAYS, buildTouch, serializeTouch } from "@/lib/seo/attribution"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const code = normalizeReferralCode((await params).code)
  const res = NextResponse.redirect(new URL("/signup", req.url), 307)
  if (!code) return res

  const secure = req.nextUrl.protocol === "https:"
  res.cookies.set(REFERRAL_COOKIE, code, { maxAge: REFERRAL_COOKIE_DAYS * 86400, path: "/", sameSite: "lax", secure, httpOnly: true })

  const untracked = req.headers.get("sec-gpc") === "1" || req.headers.get("dnt") === "1"
  if (!untracked && !req.cookies.has(ATTRIBUTION_COOKIE)) {
    const touch = buildTouch({
      pathname: "/invite",
      search: "?utm_source=invite&utm_medium=invite",
      referrer: req.headers.get("referer") ?? "",
      ownHost: req.nextUrl.hostname,
      now: new Date(),
    })
    // Written as a raw header, in exactly the form first-touch.tsx writes it:
    // the value is already URL-encoded by serializeTouch, and cookies.set
    // encodes again on the way out, which left a cookie signup could not read.
    // Not httpOnly: the first-touch script reads it to know a touch exists.
    res.headers.append(
      "Set-Cookie",
      `${ATTRIBUTION_COOKIE}=${serializeTouch(touch)}; Max-Age=${ATTRIBUTION_MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${secure ? "; Secure" : ""}`
    )
  }
  return res
}
