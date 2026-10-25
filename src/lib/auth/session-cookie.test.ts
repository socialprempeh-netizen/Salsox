/**
 * Tests for sessionTokenFromSetCookie (session-cookie.ts): the new session's
 * token read from Better Auth's Set-Cookie, on HTTP and HTTPS, and nothing
 * when the cookie is absent or being cleared.
 */
import { describe, expect, it } from "vitest"
import { sessionTokenFromSetCookie } from "./session-cookie"

const withCookies = (...cookies: string[]) => {
  const h = new Headers()
  for (const c of cookies) h.append("set-cookie", c)
  return h
}

describe("sessionTokenFromSetCookie", () => {
  it("reads the token, without its signature", () => {
    const h = withCookies("better-auth.session_token=abc123XYZ.c2lnbmF0dXJl%3D; Path=/; HttpOnly; SameSite=Lax")
    expect(sessionTokenFromSetCookie(h)).toBe("abc123XYZ")
  })

  it("reads the __Secure- cookie used on HTTPS, among others", () => {
    const h = withCookies(
      "__Secure-better-auth.session_data=eyJ...; Path=/; Secure",
      "__Secure-better-auth.session_token=tok987.sig; Path=/; HttpOnly; Secure",
    )
    expect(sessionTokenFromSetCookie(h)).toBe("tok987")
  })

  it("skips a cookie being cleared, and finds nothing when there is none", () => {
    expect(sessionTokenFromSetCookie(withCookies("better-auth.session_token=; Max-Age=0; Path=/"))).toBeNull()
    expect(sessionTokenFromSetCookie(withCookies("theme=dark; Path=/"))).toBeNull()
    expect(sessionTokenFromSetCookie(null)).toBeNull()
  })
})
