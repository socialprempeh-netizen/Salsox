/**
 * Tests for the site-wide security headers (security-headers.ts): the policy
 * keeps checkout, the signing flow and sign-in working, and keeps the doors it
 * is there to shut, shut.
 */
import { describe, expect, it } from "vitest"
import { contentSecurityPolicy, securityHeaders } from "./security-headers"

/** Parses a policy into { directive: [values] }. */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/)
      return [name, values]
    })
  )
}

const prod = parse(contentSecurityPolicy({ dev: false }))
const dev = parse(contentSecurityPolicy({ dev: true }))

describe("contentSecurityPolicy", () => {
  it("never allows eval in production, only in development", () => {
    expect(prod["script-src"]).not.toContain("'unsafe-eval'")
    expect(dev["script-src"]).toContain("'unsafe-eval'")
  })

  it("shuts plugins, base-tag hijacking and framing", () => {
    expect(prod["object-src"]).toEqual(["'none'"])
    expect(prod["base-uri"]).toEqual(["'self'"])
    expect(prod["frame-ancestors"]).toEqual(["'none'"])
  })

  it("lets forms land on Stripe, Paystack and the OAuth providers", () => {
    for (const host of ["https://*.stripe.com", "https://*.paystack.com", "https://accounts.google.com", "https://github.com"]) {
      expect(prod["form-action"]).toContain(host)
    }
  })

  it("lets pdf.js run its worker and the signature pad show its images", () => {
    expect(prod["worker-src"]).toEqual(expect.arrayContaining(["'self'", "blob:"]))
    expect(prod["script-src"]).toContain("'wasm-unsafe-eval'")
    expect(prod["img-src"]).toEqual(expect.arrayContaining(["data:", "blob:"]))
  })

  it("keeps network requests on this origin in production", () => {
    expect(prod["connect-src"]).toEqual(["'self'"])
  })

  it("is one header value, with no line breaks", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toMatch(/[\r\n]/)
  })
})

describe("securityHeaders", () => {
  it("sends each standard header exactly once", () => {
    const keys = securityHeaders({ dev: false }).map((h) => h.key)
    for (const key of ["Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options", "X-Content-Type-Options", "Referrer-Policy"]) {
      expect(keys.filter((k) => k === key)).toHaveLength(1)
    }
  })
})
