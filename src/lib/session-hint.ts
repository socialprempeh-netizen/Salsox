/**
 * "Is this visitor signed in?", asked from the browser, for the public pages.
 *
 * The landing page used to answer this on the server, and reading the session
 * cookie there made every public page render per request with
 * `Cache-Control: no-store`: no CDN cache, and server time on every visit. The
 * pages are now static, rendered for a signed-out visitor, and the few things
 * that differ for a signed-in one (the navbar's Dashboard button, the hero's
 * call to action) ask this after hydration and swap in place.
 *
 * Deliberately a plain `fetch` of Better Auth's own endpoint rather than
 * `authClient.useSession()` (src/lib/auth-client.ts): that client and its store
 * would add their weight to every public page for one boolean. It is a *hint*,
 * used only to choose which link to show; nothing is authorized by it. Every
 * private page and action still checks the session on the server, and a
 * signed-in visitor who clicks "Sign up" before the answer arrives is sent to
 * the dashboard by the proxy anyway.
 *
 * One request per page load, shared by every component that asks: the answer
 * is memoised for the life of the document. Any failure reads as signed out,
 * which is what the static page already shows.
 */

export const SESSION_ENDPOINT = "/api/auth/get-session"

/** True when the endpoint's JSON describes a live session. */
export function isSignedInResponse(body: unknown): boolean {
  if (!body || typeof body !== "object") return false
  const { session, user } = body as { session?: unknown; user?: { id?: unknown } | null }
  return Boolean(session) && typeof user?.id === "string" && user.id.length > 0
}

let pending: Promise<boolean> | null = null

/** Asks once per page load; later callers share the same answer. */
export function fetchSignedIn(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  pending ??= fetchImpl(SESSION_ENDPOINT, { credentials: "same-origin", cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then(isSignedInResponse)
    .catch(() => false)
  return pending
}

/** Tests only: forget the memoised answer. */
export function resetSessionHint() {
  pending = null
}
