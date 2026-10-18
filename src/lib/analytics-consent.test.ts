/**
 * Tests for analytics-consent.ts: GA's cookies wait for a choice that is
 * explicit, recent and ours, and GA stays off signing pages and for browsers
 * that already said no.
 */
import { describe, expect, it } from "vitest"
import { CONSENT_DEFAULT, CONSENT_MAX_AGE_MS, browserOptedOut, consentUpdate, isMeasuredPath, parseConsent, serializeConsent } from "./analytics-consent"

const now = Date.UTC(2026, 9, 18)

describe("parseConsent", () => {
  it("reads back what was saved", () => {
    expect(parseConsent(serializeConsent("granted", now), now)).toBe("granted")
    expect(parseConsent(serializeConsent("denied", now), now)).toBe("denied")
  })

  it("is null with nothing stored, or something we did not write", () => {
    expect(parseConsent(null, now)).toBeNull()
    expect(parseConsent("", now)).toBeNull()
    expect(parseConsent("granted", now)).toBeNull()
    expect(parseConsent(JSON.stringify({ choice: "yes", at: now }), now)).toBeNull()
    expect(parseConsent(JSON.stringify({ choice: "granted" }), now)).toBeNull()
  })

  it("asks again once the choice is old, or dated in the future", () => {
    expect(parseConsent(serializeConsent("granted", now - CONSENT_MAX_AGE_MS + 1000), now)).toBe("granted")
    expect(parseConsent(serializeConsent("granted", now - CONSENT_MAX_AGE_MS - 1000), now)).toBeNull()
    expect(parseConsent(serializeConsent("granted", now + 60_000), now)).toBeNull()
  })
})

describe("Consent Mode", () => {
  it("denies every storage type by default", () => {
    expect(Object.values(CONSENT_DEFAULT).every((v) => v === "denied")).toBe(true)
  })

  it("grants analytics storage only, never the ad types", () => {
    expect(consentUpdate("granted")).toEqual({ analytics_storage: "granted" })
    expect(consentUpdate("denied")).toEqual({ analytics_storage: "denied" })
  })
})

describe("isMeasuredPath", () => {
  it("never measures a signing page, whose path is a token", () => {
    expect(isMeasuredPath("/sign/abc123")).toBe(false)
    expect(isMeasuredPath("/")).toBe(true)
    expect(isMeasuredPath("/sign-pdf")).toBe(true)
    expect(isMeasuredPath("/pricing")).toBe(true)
  })
})

describe("browserOptedOut", () => {
  it("honours Global Privacy Control and Do Not Track", () => {
    expect(browserOptedOut({ globalPrivacyControl: true })).toBe(true)
    expect(browserOptedOut({ doNotTrack: "1" })).toBe(true)
    expect(browserOptedOut({ doNotTrack: "0" })).toBe(false)
    expect(browserOptedOut({})).toBe(false)
  })
})
