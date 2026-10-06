/**
 * Where to send someone after they sign up, when the page that sent them
 * asked (`/signup?next=...`): the free request-a-signature tool hands a
 * prepared document over to Quick Send this way.
 *
 * A `next` parameter is an open redirect waiting to happen: anyone can craft
 * a signup link that lands a new user on a phishing page. So it is accepted
 * only when it is a path inside the dashboard, with no scheme, no host and no
 * protocol-relative or backslash tricks; anything else falls back to the
 * dashboard itself.
 */
export const DEFAULT_AFTER_SIGNUP = "/dashboard"

export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > 200) return DEFAULT_AFTER_SIGNUP
  if (!/^\/dashboard(\/[A-Za-z0-9\-/]*)?(\?[A-Za-z0-9=&\-_]*)?$/.test(value)) return DEFAULT_AFTER_SIGNUP
  if (value.includes("//") || value.includes("\\")) return DEFAULT_AFTER_SIGNUP
  return value
}
