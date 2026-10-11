/**
 * The base URL of this deployment, with no trailing slash.
 *
 * Links in emails and Stripe return URLs used to be built as
 * `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`. On a deployment where that
 * variable was missing, the welcome email's dashboard button became
 * "undefined/dashboard", which mail clients turn into http://undefined/dashboard.
 * Every absolute link now goes through `siteConfig.url`, which is this.
 *
 * The first value that is set wins:
 *   1. NEXT_PUBLIC_APP_URL, the documented setting;
 *   2. BETTER_AUTH_URL, which auth already reads, so the two cannot disagree
 *      when only one was set;
 *   3. VERCEL_PROJECT_PRODUCTION_URL, the project's production domain, which
 *      Vercel sets on every deployment (a host name, so https is added);
 *   4. http://localhost:3000, for local development.
 *
 * Pure: takes the environment as an argument so the order is tested.
 */
export function resolveAppUrl(env: Record<string, string | undefined>): string {
  const explicit = env.NEXT_PUBLIC_APP_URL?.trim() || env.BETTER_AUTH_URL?.trim()
  if (explicit) return explicit.replace(/\/+$/, "")
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
  return "http://localhost:3000"
}

/**
 * The origins sign-in requests may come from: the base URL's own, plus its
 * apex or www counterpart. A custom domain is usually served under both, one
 * redirecting to the other, and Better Auth only trusts its base URL's origin
 * by default. With the base URL on salsox.com, a sign-in posted from a page on
 * www.salsox.com would be refused as "invalid origin", and the other way
 * round. Local and *.vercel.app hosts have no counterpart.
 */
export function trustedOriginsFor(appUrl: string): string[] {
  let url: URL
  try {
    url = new URL(appUrl)
  } catch {
    return []
  }
  const origins = [url.origin]
  const host = url.hostname
  if (host === "localhost" || /^[\d.]+$/.test(host) || host.endsWith(".vercel.app")) return origins
  const counterpart = host.startsWith("www.") ? host.slice(4) : host.split(".").length === 2 ? `www.${host}` : null
  if (counterpart) origins.push(`${url.protocol}//${counterpart}${url.port ? `:${url.port}` : ""}`)
  return origins
}

/**
 * Where a request on the base URL's apex or www counterpart should go instead,
 * or null when it is already on the right host (or there is no counterpart).
 *
 * Both forms of a custom domain can serve the app with no redirect between
 * them. Sign-in then broke on the first try from the other form: Better Auth
 * sets its OAuth state cookie on the host the sign-in started from
 * (www.salsox.com), but sends the provider a redirect URI built from the base
 * URL (salsox.com), so the callback arrived where that cookie does not exist
 * and was refused as state_mismatch. Back on /login, now on the base URL's
 * host, the second try worked. Serving every page from one host means the
 * cookie and the callback always share it.
 *
 * `/api` is left alone: webhooks and other machine callers do not follow
 * redirects, and an endpoint already registered on the other form must keep
 * answering there.
 *
 * Pure: takes the base URL and the request URL, so the rule is tested.
 */
export function canonicalHostRedirect(appUrl: string, requestUrl: URL): string | null {
  const [canonical, counterpart] = trustedOriginsFor(appUrl)
  if (!canonical || !counterpart) return null
  // Host, not origin: behind a proxy the request URL can report http while the
  // visitor is on https, and the host alone is what decides.
  if (requestUrl.host !== new URL(counterpart).host) return null
  if (requestUrl.pathname === "/api" || requestUrl.pathname.startsWith("/api/")) return null
  return `${canonical}${requestUrl.pathname}${requestUrl.search}`
}
