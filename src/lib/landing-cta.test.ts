/**
 * Tests for the landing page's call-to-action destinations (landing-cta.ts):
 * neither button may lead to the pricing section on a product deployment.
 */
import { describe, expect, it } from "vitest"
import { getStartedHref, heroCtaHref, footerTryLink, heroSecondaryCta } from "./landing-cta"

describe("heroCtaHref", () => {
  it("sends a visitor without an account to sign up", () => {
    expect(heroCtaHref({ isKitSite: false, signedIn: false })).toBe("/signup")
  })

  it("sends a signed-in user straight to uploading a document", () => {
    expect(heroCtaHref({ isKitSite: false, signedIn: true })).toBe("/dashboard/documents/new")
  })

  it("keeps pricing as the destination only on the kit's own site", () => {
    expect(heroCtaHref({ isKitSite: true, signedIn: false })).toBe("#pricing")
  })
})

describe("getStartedHref", () => {
  it("leads to sign up, not to billing", () => {
    expect(getStartedHref()).toBe("/signup")
    expect(getStartedHref()).not.toContain("pricing")
  })
})

describe("demo links", () => {
  // They used to fall back to /login, a sign-in form that shows nothing.
  it("never lead to the sign-in page", () => {
    expect(heroSecondaryCta(null).href).not.toBe("/login")
    expect(footerTryLink(null).href).not.toBe("/login")
  })

  it("lead to a configured demo deployment, and otherwise to the guide and the free plan", () => {
    expect(heroSecondaryCta("https://demo.example")).toEqual({ href: "https://demo.example", label: "liveDemo" })
    expect(heroSecondaryCta(null)).toEqual({ href: "/docs/getting-started", label: "howItWorks" })
    expect(footerTryLink(null)).toEqual({ href: "/signup", label: "tryFree" })
  })
})
