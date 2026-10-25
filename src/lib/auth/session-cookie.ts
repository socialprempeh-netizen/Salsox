/**
 * The session token in a Set-Cookie header that Better Auth answered with.
 *
 * Why it is needed: finishing 2FA setup replaces the session. The plugin
 * creates a new one, sets its cookie, deletes the old one, and then returns
 * the OLD token in its JSON body (better-auth 1.7, two-factor/totp verify).
 * The cookie is the only place the new session's token appears, and it is the
 * session the user now holds, so it is the one to mark as having passed the
 * second factor (src/lib/two-factor-policy.ts).
 *
 * The cookie is `better-auth.session_token`, or `__Secure-` in front of it on
 * HTTPS, and its value is `token.signature`, URL-encoded. A cookie being
 * cleared (empty value) is skipped.
 */
export function sessionTokenFromSetCookie(headers: Headers | null | undefined): string | null {
  if (!headers) return null
  const cookies = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""]
  for (const cookie of cookies) {
    const match = cookie.match(/(?:^|[\s,;])(?:__Secure-)?[\w.-]*session_token=([^;,\s]*)/)
    if (!match?.[1]) continue
    const token = decodeURIComponent(match[1]).split(".")[0]
    if (token) return token
  }
  return null
}
