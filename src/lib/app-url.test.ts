/**
 * Tests for the deployment base URL (app-url.ts): whatever is or is not set,
 * the result is a real origin, never "undefined".
 */
import { describe, expect, it } from "vitest"
import { canonicalHostRedirect, resolveAppUrl, trustedOriginsFor } from "./app-url"

describe("resolveAppUrl", () => {
  it("uses NEXT_PUBLIC_APP_URL first, without a trailing slash", () => {
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "https://salsox.com/", BETTER_AUTH_URL: "https://other.example" })).toBe("https://salsox.com")
  })

  it("falls back to BETTER_AUTH_URL when the app URL is missing or blank", () => {
    expect(resolveAppUrl({ BETTER_AUTH_URL: "https://salsox.com" })).toBe("https://salsox.com")
    expect(resolveAppUrl({ NEXT_PUBLIC_APP_URL: "  ", BETTER_AUTH_URL: "https://salsox.com" })).toBe("https://salsox.com")
  })

  it("falls back to Vercel's production domain, adding https", () => {
    expect(resolveAppUrl({ VERCEL_PROJECT_PRODUCTION_URL: "salsox.vercel.app" })).toBe("https://salsox.vercel.app")
  })

  it("uses localhost only when nothing is set", () => {
    expect(resolveAppUrl({})).toBe("http://localhost:3000")
  })

  it("never produces the string 'undefined'", () => {
    const link = `${resolveAppUrl({ NEXT_PUBLIC_APP_URL: undefined })}/dashboard`
    expect(link).not.toContain("undefined")
  })
})

describe("trustedOriginsFor", () => {
  it("trusts the apex domain and its www form", () => {
    expect(trustedOriginsFor("https://salsox.com")).toEqual(["https://salsox.com", "https://www.salsox.com"])
    expect(trustedOriginsFor("https://www.salsox.com/")).toEqual(["https://www.salsox.com", "https://salsox.com"])
  })

  it("adds nothing for hosts that have no www counterpart", () => {
    expect(trustedOriginsFor("http://localhost:3000")).toEqual(["http://localhost:3000"])
    expect(trustedOriginsFor("https://salsox.vercel.app")).toEqual(["https://salsox.vercel.app"])
    expect(trustedOriginsFor("https://app.salsox.com")).toEqual(["https://app.salsox.com"])
  })

  it("returns nothing for a value that is not a URL", () => {
    expect(trustedOriginsFor("undefined")).toEqual([])
  })
})

describe("canonicalHostRedirect", () => {
  it("sends the www form to the apex base URL, keeping path and query", () => {
    expect(canonicalHostRedirect("https://salsox.com", new URL("https://www.salsox.com/login?next=%2Fdashboard"))).toBe("https://salsox.com/login?next=%2Fdashboard")
  })

  it("matches by host, so an http request URL behind a proxy still redirects to the https base URL", () => {
    expect(canonicalHostRedirect("https://salsox.com", new URL("http://www.salsox.com/login"))).toBe("https://salsox.com/login")
  })

  it("sends the apex form to a www base URL", () => {
    expect(canonicalHostRedirect("https://www.salsox.com", new URL("https://salsox.com/pricing"))).toBe("https://www.salsox.com/pricing")
  })

  it("leaves requests already on the base URL's host alone", () => {
    expect(canonicalHostRedirect("https://salsox.com", new URL("https://salsox.com/login"))).toBeNull()
  })

  it("leaves the API alone on either host, so webhooks keep answering", () => {
    expect(canonicalHostRedirect("https://salsox.com", new URL("https://www.salsox.com/api/auth/callback/google?code=x"))).toBeNull()
    expect(canonicalHostRedirect("https://salsox.com", new URL("https://www.salsox.com/api"))).toBeNull()
    expect(canonicalHostRedirect("https://salsox.com", new URL("https://www.salsox.com/apidocs"))).toBe("https://salsox.com/apidocs")
  })

  it("does nothing for hosts with no counterpart: localhost, previews, other hosts", () => {
    expect(canonicalHostRedirect("http://localhost:3000", new URL("http://localhost:3000/login"))).toBeNull()
    expect(canonicalHostRedirect("https://salsox.com", new URL("https://salsox-git-x.vercel.app/login"))).toBeNull()
    expect(canonicalHostRedirect("undefined", new URL("https://www.salsox.com/login"))).toBeNull()
  })
})
