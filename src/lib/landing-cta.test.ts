/**
 * Tests for the landing page's call-to-action destinations (landing-cta.ts):
 * neither button may lead to the pricing section on a product deployment.
 */
import { describe, expect, it } from "vitest"
import { getStartedHref, heroCtaHref, footerTryLink, heroSecondaryCta } from "./landing-cta"

describe("heroCtaHref", () => {
  it("sends a visitor without an account to sign up, then straight to Quick Send", () => {
    expect(heroCtaHref({ isKitSite: false, signedIn: false })).toBe("/signup?next=/dashboard/documents/quick-send")
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
    expect(getStartedHref()).toBe("/signup?next=/dashboard/documents/quick-send")
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
    expect(heroSecondaryCta(null)).toEqual({ href: "/resources/help/send-a-document-step-by-step", label: "howItWorks" })
    expect(footerTryLink(null)).toEqual({ href: "/signup?next=/dashboard/documents/quick-send", label: "tryFree" })
  })
})

describe("the signup links' destination after signing up", () => {
  it("is one the signup form accepts, so it is not dropped for /dashboard", async () => {
    const { safeNext } = await import("./safe-next")
    const next = new URLSearchParams(getStartedHref().split("?")[1]).get("next")
    expect(safeNext(next)).toBe("/dashboard/documents/quick-send")
  })
})

describe("afterToolCtaHref", () => {
  it("sends a visitor to sign up and then to Quick Send", async () => {
    const { afterToolCtaHref, SIGNUP_TO_FIRST_DOCUMENT_PATH } = await import("./landing-cta")
    expect(afterToolCtaHref(false)).toBe(SIGNUP_TO_FIRST_DOCUMENT_PATH)
    // Unknown yet (the session check has not answered): the signup link, which
    // the proxy forwards a signed-in visitor past anyway.
    expect(afterToolCtaHref(null)).toBe(SIGNUP_TO_FIRST_DOCUMENT_PATH)
  })

  it("sends a signed-in visitor straight to Quick Send", async () => {
    const { afterToolCtaHref, QUICK_SEND_PATH } = await import("./landing-cta")
    expect(afterToolCtaHref(true)).toBe(QUICK_SEND_PATH)
  })
})
