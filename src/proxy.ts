import { auth } from "@/auth"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import createIntlMiddleware from "next-intl/middleware"
import { routing } from "@/i18n/routing"
import { siteConfig } from "@/config/site"
import { canonicalHostRedirect } from "@/lib/app-url"
import { safeNext } from "@/lib/safe-next"
import { deployPingId, INDEXNOW_KEY_PATH, isKeyFilePath, resolveIndexNowKey } from "@/lib/indexnow"
import { isLocalizedMetadataImagePath } from "@/lib/metadata-image-path"

/**
 * Locale handling for the public surface only.
 *
 * The private areas below are matched by prefix, and a locale segment in front
 * of `/dashboard` would stop those prefixes from matching: `/it/dashboard`
 * would not look protected. Rather than teach every list here to strip a
 * locale, the private areas stay outside the prefix entirely, so those URLs do
 * not exist. See `src/i18n/routing.ts` for how to lift that if you want your
 * dashboard localized.
 */
const intlMiddleware = createIntlMiddleware(routing)

/**
 * Everything that must never carry a locale prefix.
 *
 * Two kinds of thing end up here. The private areas and the sign-in pages,
 * which live outside `src/app/[locale]/` by design. And the root level
 * metadata routes, which Next serves from `src/app/` directly: prefixing those
 * asks for `/en/sitemap.xml`, which does not exist, so the file 404s instead of
 * being served. That failure is quiet in the worst way, since nothing links to
 * a favicon or a sitemap from inside the app.
 *
 * Adding a file at the root of `src/app/` means adding it here too.
 */
const UNLOCALIZED = [
  // Private areas and auth, matched by prefix.
  "/dashboard",
  "/admin",
  "/api",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify-request",
  "/2fa",
  // Public signing links (/sign/{token}). Public but not localized: signers
  // have no account and arrive from an email, WhatsApp or SMS link that must
  // resolve exactly as sent. The token is the authorization, checked by the
  // page itself, so this path is deliberately absent from PROTECTED_ROUTES.
  "/sign/",
  // Invite links (/invite/{code}, src/lib/referrals.ts): a redirect to
  // signup that must resolve exactly as shared.
  "/invite/",
  // Root level metadata routes.
  "/sitemap.xml",
  "/robots.txt",
  "/llms.txt",
  "/indexnow-key.txt",
  "/icon",
  "/opengraph-image",
]

/**
 * IndexNow (src/lib/indexnow.ts). The key is read once per server instance;
 * it only changes with the environment, which a redeploy replaces.
 *
 * - The key file is served at `/{key}.txt`, where the protocol expects it,
 *   by rewriting to the fixed route that renders it. The name is the key, so
 *   it cannot be a static file or a route of its own.
 * - The first request a production deployment serves starts its deploy-time
 *   sync (`/api/indexnow?trigger=deploy`) in the background: `waitUntil`
 *   keeps it running after the response is sent, so no visitor waits on it,
 *   and a failure is only logged. Each instance asks once; the route claims
 *   the deployment, so only one of them submits.
 */
const indexNowKey = resolveIndexNowKey(process.env)
let deploySyncRequested = false

function requestDeploySync(event: NextFetchEvent) {
  deploySyncRequested = true
  const secret = process.env.CRON_SECRET
  if (!secret || !deployPingId(process.env)) return
  event.waitUntil(
    fetch(new URL("/api/indexnow?trigger=deploy", siteConfig.url), { headers: { authorization: `Bearer ${secret}` } })
      .then((res) => {
        if (!res.ok) console.error(`[indexnow] deploy sync answered ${res.status}`)
      })
      .catch((error) => console.error("[indexnow] deploy sync request failed", error))
  )
}

/**
 * Private surfaces, matched by prefix. Anything not listed here falls through
 * to the router, so a URL that does not exist renders your 404 page.
 *
 * This is a denylist on purpose. With the allowlist it replaced, every path
 * the list did not know about looked private: a typo like `/doc` instead of
 * `/docs` was bounced to `/login`, and an anonymous visitor never saw the 404
 * page at all. Loosening the proxy opens nothing, because each private area
 * already gates itself server-side: `(dashboard)/layout.tsx` and
 * `(admin)/layout.tsx` call `auth()` and redirect, and the private API routes
 * each return 401 on their own. Treat this file as defence in depth, and add
 * a prefix here when you add a private area outside `/dashboard`.
 */
const PROTECTED_ROUTES = ["/dashboard", "/api/checkout", "/api/billing", "/api/documents", "/api/export"]
const ADMIN_ROUTES = ["/admin", "/api/admin"]
// `/2fa` belongs here for the same reason as the other two: it is a step on the
// way in, so somebody who already holds a session has nothing to do on it. The
// second factor is asked for BEFORE a session exists, which is why sending a
// signed-in visitor to the dashboard cannot interrupt a verification.
const AUTH_ROUTES = ["/login", "/signup", "/2fa"]

// Reading the session here means one database round trip per request, where
// the old JWT was verified in memory. `session.cookieCache` in src/auth.ts is
// what buys most of them back. Next.js 16 is what makes this possible at all:
// on older versions the proxy could only look at the cookie without validating
// it, which the Better Auth docs are blunt about ("THIS IS NOT SECURE").
//
// Either way this is a redirect layer, not the authorization: the real check
// lives in requireUser() and requireAdmin(), on the page.
export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl

  // One host for every page, before anything else: the apex and www forms both
  // served the app, and a Google sign-in started on the one that is not the
  // base URL failed its first try with state_mismatch (src/lib/app-url.ts).
  // Permanent, so browsers and search engines settle on the base URL's host.
  // The host comes from the Host header: req.nextUrl can carry the server's
  // own address instead of the one the visitor typed (it does under next dev).
  const requested = new URL(`${req.nextUrl.pathname}${req.nextUrl.search}`, `${req.nextUrl.protocol}//${req.headers.get("host") ?? req.nextUrl.host}`)
  const canonical = canonicalHostRedirect(siteConfig.url, requested)
  if (canonical) return NextResponse.redirect(canonical, 308)

  if (isKeyFilePath(pathname, indexNowKey)) return NextResponse.rewrite(new URL(INDEXNOW_KEY_PATH, req.url))
  // Not from an API call: the sync's own request must not start another.
  if (!deploySyncRequested && !pathname.startsWith("/api/")) requestDeploySync(event)
  // Was read first, for every request:
  // const session = await auth.api.getSession({ headers: req.headers })
  const isAuthRoute = AUTH_ROUTES.some((r) => pathname.startsWith(r))
  const isAdminRoute = ADMIN_ROUTES.some((r) => pathname.startsWith(r))
  const isProtectedRoute = PROTECTED_ROUTES.some((r) => pathname.startsWith(r))

  // The session is only looked up where one of the guards below uses it.
  // Every public page (the landing page above all, now static and cached)
  // used to pay a session lookup here on each visit, a database round trip
  // for a signed-in visitor once the cookie cache expired, to decide nothing.
  const session = isAuthRoute || isAdminRoute || isProtectedRoute ? await auth.api.getSession({ headers: req.headers }) : null
  const isLoggedIn = !!session
  const isAdmin = session?.user?.role === "ADMIN"

  // `/api/auth` and the inbound webhooks (e.g. Stripe) carry no session and
  // need no special case here: they are not in the lists above, so they pass.
  // Signed in already: go where the link was going (`?next=`, checked by
  // safeNext), not always to /dashboard. Public calls to action point at
  // /signup?next=… (a template's "Use this template", Quick Send), and a
  // visitor who is already signed in would otherwise land on the dashboard
  // home and lose the page they asked for. Was:
  //   return NextResponse.redirect(new URL("/dashboard", req.nextUrl))
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get("next")), req.nextUrl))
  }

  if (isAdminRoute) {
    if (!isLoggedIn) return NextResponse.redirect(new URL("/login", req.nextUrl))
    if (!isAdmin) return NextResponse.redirect(new URL("/dashboard", req.nextUrl))
    return NextResponse.next()
  }

  if (isProtectedRoute && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl))
  }

  // Past the guards. Anything that is not a private area is public surface, so
  // it goes through locale resolution; the private areas keep the plain
  // response they have always had.
  if (UNLOCALIZED.some((r) => pathname.startsWith(r))) {
    return NextResponse.next()
  }

  // The social cards Next links from every page carry the default locale's
  // prefix (/en/.../opengraph-image-…); served as they are rather than sent
  // through the locale redirect, so a share preview gets a direct 200
  // (src/lib/metadata-image-path.ts).
  if (isLocalizedMetadataImagePath(pathname, routing.defaultLocale)) {
    return NextResponse.next()
  }

  return intlMiddleware(req)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
