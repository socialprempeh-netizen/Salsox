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

  // Was `https:`, any host. Profile pictures come from two known hosts.
  it("loads images only from this origin and the OAuth avatar hosts", () => {
    expect(prod["img-src"]).not.toContain("https:")
    expect(prod["img-src"]).toEqual(
      expect.arrayContaining(["'self'", "https://*.googleusercontent.com", "https://avatars.githubusercontent.com"])
    )
  })

  it("names no third-party script, style or font host in production", () => {
    for (const directive of ["style-src", "font-src"]) {
      expect(prod[directive].filter((v) => v.startsWith("http"))).toEqual([])
    }
    expect(prod["script-src"].filter((v) => v.startsWith("http"))).toEqual(["https://va.vercel-scripts.com"])
  })

  it("upgrades insecure requests in production only, where there is HTTPS", () => {
    expect(prod).toHaveProperty("upgrade-insecure-requests")
    expect(dev).not.toHaveProperty("upgrade-insecure-requests")
  })

  it("is one header value, with no line breaks", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toMatch(/[\r\n]/)
  })
})

describe("analytics hosts", () => {
  it("names no Google host unless analytics is configured", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toMatch(/googletagmanager|google-analytics/)
    const ga = parse(contentSecurityPolicy({ dev: false, ga: true }))
    expect(ga["script-src"]).toContain("https://www.googletagmanager.com")
    expect(ga["connect-src"]).toContain("https://*.google-analytics.com")
  })

  it("lets the browser reach Sentry's ingest origin only when it is on", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toMatch(/sentry/)
    const on = parse(contentSecurityPolicy({ dev: false, sentry: "https://o1.ingest.us.sentry.io" }))
    expect(on["connect-src"]).toEqual(["'self'", "https://o1.ingest.us.sentry.io"])
    // Nothing else opens up for it.
    expect(on["script-src"]).toEqual(prod["script-src"])
  })
})

describe("securityHeaders", () => {
  it("sends each standard header exactly once", () => {
    const keys = securityHeaders({ dev: false }).map((h) => h.key)
    for (const key of [
      "Content-Security-Policy",
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]) {
      expect(keys.filter((k) => k === key)).toHaveLength(1)
    }
  })

  it("switches off the powerful browser features the app never uses", () => {
    const policy = securityHeaders({ dev: false }).find((h) => h.key === "Permissions-Policy")!.value
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb", "browsing-topics"]) {
      expect(policy).toContain(`${feature}=()`)
    }
  })
})
