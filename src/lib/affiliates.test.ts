import { describe, expect, it } from "vitest"
import { AFFILIATE_COMMISSION, affiliateDestination, affiliateLink, claimableAffiliateCode, commissionFor, commissionWindowEnd, conversionRate, dailySeries, isBot, normalizeAffiliateCode } from "./affiliates"

describe("affiliate codes", () => {
  it("are 3 to 24 lower-case letters, digits and inner single hyphens", () => {
    expect(normalizeAffiliateCode(" Jane-Doe ")).toBe("jane-doe")
    expect(normalizeAffiliateCode("ab")).toBeNull()
    expect(normalizeAffiliateCode("-jane")).toBeNull()
    expect(normalizeAffiliateCode("jane-")).toBeNull()
    expect(normalizeAffiliateCode("jane--doe")).toBeNull()
    expect(normalizeAffiliateCode("jane_doe")).toBeNull()
    expect(normalizeAffiliateCode("a".repeat(25))).toBeNull()
    expect(normalizeAffiliateCode("a".repeat(24))).toBe("a".repeat(24))
  })

  it("cannot claim a name that reads as official", () => {
    expect(claimableAffiliateCode("support")).toBe(false)
    expect(claimableAffiliateCode("Pricing")).toBe(false)
    expect(claimableAffiliateCode("legal-eagle")).toBe(true)
  })
})

describe("affiliate links", () => {
  it("land only on the listed pages of this site", () => {
    expect(affiliateDestination("/pricing")).toBe("/pricing")
    expect(affiliateDestination("/pricing/?x=1#top")).toBe("/pricing")
    expect(affiliateDestination("//evil.example/x")).toBe("/")
    expect(affiliateDestination("https://evil.example")).toBe("/")
    expect(affiliateDestination("/\\evil.example")).toBe("/")
    expect(affiliateDestination("/admin")).toBe("/")
    expect(affiliateDestination(null)).toBe("/")
  })

  it("carry the destination only when it is not the home page", () => {
    expect(affiliateLink("jane", "https://example.com/")).toBe("https://example.com/go/jane")
    expect(affiliateLink("jane", "https://example.com", "/pricing")).toBe("https://example.com/go/jane?to=%2Fpricing")
  })
})

describe("isBot", () => {
  it("skips crawlers, unfurlers and empty agents, and counts browsers", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true)
    expect(isBot("facebookexternalhit/1.1")).toBe(true)
    expect(isBot("WhatsApp/2.23")).toBe(true)
    expect(isBot("")).toBe(true)
    expect(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1")).toBe(false)
  })
})

describe("dashboard numbers", () => {
  it("buckets clicks and signups by UTC day, oldest first, zeros included", () => {
    const now = new Date("2026-10-24T09:00:00Z")
    const series = dailySeries(
      [new Date("2026-10-24T01:00:00Z"), new Date("2026-10-23T23:59:00Z"), new Date("2026-10-23T00:00:00Z"), new Date("2026-09-01T00:00:00Z")],
      [new Date("2026-10-24T05:00:00Z")],
      3,
      now
    )
    expect(series).toEqual([
      { date: "2026-10-22", clicks: 0, signups: 0 },
      { date: "2026-10-23", clicks: 2, signups: 0 },
      { date: "2026-10-24", clicks: 1, signups: 1 },
    ])
  })

  it("gives a conversion rate only when there were visitors", () => {
    expect(conversionRate(1, 3)).toBe(33.3)
    expect(conversionRate(0, 0)).toBeNull()
  })
})

describe("affiliate commission", () => {
  const first = new Date("2026-01-31T10:00:00Z")

  it("is 20% recurring for 12 months by default", () => {
    expect(AFFILIATE_COMMISSION).toEqual({ percent: 20, months: 12 })
  })

  it("is the percent of each payment, rounded down to the cent", () => {
    expect(commissionFor(1900, first, first)).toBe(380)
    expect(commissionFor(999, first, first)).toBe(199)
    expect(commissionFor(4, first, first)).toBe(0)
  })

  it("is paid on every payment inside the window and none after it", () => {
    expect(commissionWindowEnd(first).toISOString()).toBe("2027-01-31T10:00:00.000Z")
    expect(commissionFor(1900, new Date("2027-01-31T09:59:59Z"), first)).toBe(380)
    expect(commissionFor(1900, new Date("2027-01-31T10:00:00Z"), first)).toBe(0)
  })

  it("is nothing on a payment of nothing", () => {
    expect(commissionFor(0, first, first)).toBe(0)
    expect(commissionFor(-500, first, first)).toBe(0)
    expect(commissionFor(Number.NaN, first, first)).toBe(0)
  })
})
