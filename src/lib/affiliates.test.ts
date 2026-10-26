import { describe, expect, it } from "vitest"
import { AFFILIATE_COMMISSION, AFFILIATE_PAYOUT, affiliateDestination, clearedCutoff, commissionClearsAt, nextPayoutDate, payoutDue, payoutMinimum, affiliateLink, claimableAffiliateCode, commissionAt, commissionFor, commissionMonth, commissionWindowEnd, conversionRate, dailySeries, inCommissionWindow, isBot, monthRange, normalizeAffiliateCode, rerateMonth, tierPercent, type MonthRow } from "./affiliates"

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

  it("is 25% base, 35% and 45% tiers, for 12 months, from one config", () => {
    expect(AFFILIATE_COMMISSION.months).toBe(12)
    expect(AFFILIATE_COMMISSION.basePercent).toBe(25)
    expect(AFFILIATE_COMMISSION.tiers.map((t) => [t.over, t.percent])).toEqual([[10_000, 35], [25_000, 45]])
  })

  it("picks the month's tier from its net revenue, strictly over each threshold", () => {
    expect(tierPercent(10_000, "usd")).toBe(25)
    expect(tierPercent(10_001, "usd")).toBe(35)
    expect(tierPercent(25_000, "USD")).toBe(35)
    expect(tierPercent(25_001, "usd")).toBe(45)
  })

  it("keeps other currencies at the base rate until thresholds are set for them", () => {
    expect(tierPercent(10_000_000, "ghs")).toBe(25)
  })

  it("writes a new payment at the base rate, rounded down to the cent", () => {
    expect(commissionFor(1900, first, first)).toBe(475)
    expect(commissionFor(999, first, first)).toBe(249)
    expect(commissionAt(3, 25)).toBe(0)
  })

  it("is paid on every payment inside the window and none after it", () => {
    expect(commissionWindowEnd(first).toISOString()).toBe("2027-01-31T10:00:00.000Z")
    expect(commissionFor(1900, new Date("2027-01-31T09:59:59Z"), first)).toBe(475)
    expect(commissionFor(1900, new Date("2027-01-31T10:00:00Z"), first)).toBe(0)
    expect(inCommissionWindow(new Date("2026-06-01T00:00:00Z"), first)).toBe(true)
  })

  it("is nothing on a payment of nothing", () => {
    expect(commissionFor(0, first, first)).toBe(0)
    expect(commissionFor(-500, first, first)).toBe(0)
    expect(commissionFor(Number.NaN, first, first)).toBe(0)
  })

  it("buckets payments by UTC calendar month", () => {
    expect(commissionMonth(new Date("2026-03-31T23:59:59Z"))).toBe("2026-03")
    expect(commissionMonth(new Date("2026-04-01T00:00:00Z"))).toBe("2026-04")
    expect(monthRange("2026-12")).toEqual({ start: new Date("2026-12-01T00:00:00Z"), end: new Date("2027-01-01T00:00:00Z") })
  })
})

describe("rerateMonth", () => {
  const row = (id: string, amount: number, extra: Partial<MonthRow> = {}): MonthRow => ({ id, amount, currency: "usd", reversed: false, paidOut: false, percent: 25, commission: Math.floor(amount * 0.25), ...extra })

  it("leaves a month under the first threshold alone", () => {
    expect(rerateMonth([row("a", 4900), row("b", 4900)])).toEqual([])
  })

  it("lifts every payment of the month once it passes a threshold, the earlier ones too", () => {
    expect(rerateMonth([row("a", 6000), row("b", 6000)])).toEqual([
      { id: "a", percent: 35, commission: 2100 },
      { id: "b", percent: 35, commission: 2100 },
    ])
    expect(rerateMonth([row("a", 20_000), row("b", 6000, { percent: 35, commission: 2100 })])).toEqual([
      { id: "a", percent: 45, commission: 9000 },
      { id: "b", percent: 45, commission: 2700 },
    ])
  })

  it("drops a tier when a refund takes the month back under", () => {
    const rows = [row("a", 6000, { percent: 35, commission: 2100 }), row("b", 6000, { reversed: true, percent: 35, commission: 2100 })]
    expect(rerateMonth(rows)).toEqual([{ id: "a", percent: 25, commission: 1500 }])
  })

  it("never changes a row already paid out", () => {
    expect(rerateMonth([row("a", 6000, { paidOut: true }), row("b", 6000)])).toEqual([{ id: "b", percent: 35, commission: 2100 }])
  })
})

describe("payouts", () => {
  it("clears a commission once its payment is past the hold", () => {
    const paidAt = new Date("2026-10-01T12:00:00Z")
    expect(commissionClearsAt(paidAt).toISOString()).toBe("2026-10-31T12:00:00.000Z")
    const now = new Date("2026-10-31T12:00:00Z")
    expect(paidAt.getTime() <= clearedCutoff(now).getTime()).toBe(true)
    expect(paidAt.getTime() <= clearedCutoff(new Date("2026-10-31T11:59:59Z")).getTime()).toBe(false)
    expect(AFFILIATE_PAYOUT.holdDays).toBe(30)
  })

  it("pays on this month's payout day until it passes, then next month's", () => {
    expect(nextPayoutDate(new Date("2026-10-03T08:00:00Z")).toISOString()).toBe("2026-10-15T00:00:00.000Z")
    expect(nextPayoutDate(new Date("2026-10-15T23:00:00Z")).toISOString()).toBe("2026-10-15T00:00:00.000Z")
    expect(nextPayoutDate(new Date("2026-10-16T00:00:00Z")).toISOString()).toBe("2026-11-15T00:00:00.000Z")
    expect(nextPayoutDate(new Date("2026-12-20T00:00:00Z")).toISOString()).toBe("2027-01-15T00:00:00.000Z")
  })

  it("holds a balance under the currency's minimum, and has none for other currencies", () => {
    expect(payoutMinimum("USD")).toBe(5_000)
    expect(payoutDue(4_999, "usd")).toBe(false)
    expect(payoutDue(5_000, "usd")).toBe(true)
    expect(payoutMinimum("ghs")).toBe(0)
    expect(payoutDue(1, "ghs")).toBe(true)
    expect(payoutDue(0, "ghs")).toBe(false)
  })
})
