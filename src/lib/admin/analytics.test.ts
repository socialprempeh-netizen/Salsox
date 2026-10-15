/**
 * Tests for the admin analytics arithmetic (analytics.ts).
 */
import { describe, expect, it } from "vitest"
import { classifyPlanChange, daysAgo, median, parseWindow, rate, weeklyCounts } from "./analytics"

const now = new Date("2026-10-15T12:00:00Z")

describe("weeklyCounts", () => {
  it("buckets dates into weeks ending now, oldest first, ignoring the rest", () => {
    const buckets = weeklyCounts([daysAgo(1, now), daysAgo(2, now), daysAgo(8, now), daysAgo(400, now)], { weeks: 4, now })
    expect(buckets.map((b) => b.count)).toEqual([0, 0, 1, 2])
    expect(buckets[0].start.getTime()).toBe(daysAgo(28, now).getTime())
  })
})

describe("rate", () => {
  it("divides, and gives null rather than infinity or NaN for an empty whole", () => {
    expect(rate(1, 4)).toBe(0.25)
    expect(rate(0, 0)).toBeNull()
  })
})

describe("parseWindow", () => {
  it("accepts the offered windows and falls back to 30 days", () => {
    expect(parseWindow("7")).toBe(7)
    expect(parseWindow("90")).toBe(90)
    expect(parseWindow("31")).toBe(30)
    expect(parseWindow(undefined)).toBe(30)
  })
})

describe("classifyPlanChange", () => {
  const plans = [
    { stripePriceId: "personal_m", price: 900, interval: "MONTH" },
    { stripePriceId: "personal_y", price: 9000, interval: "YEAR" },
    { stripePriceId: "business_m", price: 1900, interval: "MONTH" },
  ]
  it("compares monthly equivalents", () => {
    expect(classifyPlanChange("personal_m", "business_m", plans)).toBe("upgrade")
    expect(classifyPlanChange("business_m", "personal_y", plans)).toBe("downgrade")
    expect(classifyPlanChange("personal_m", "personal_m", plans)).toBe("lateral")
    expect(classifyPlanChange("personal_m", "unknown", plans)).toBeNull()
  })
})

describe("median", () => {
  it("takes the middle value, averaging the two middles of an even count", () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBeNull()
  })
})
