import { describe, it, expect } from "vitest"
import {
  testKeyProblem,
  isPlaceholderPriceId,
  lookupKeyFor,
  productIdFor,
  priceMatchesPlan,
  planPriceAction,
  describePlanPrice,
  type StripePriceSpec,
} from "@/lib/stripe-plan-prices"

const monthly = { slug: "starter-monthly", price: 900, interval: "MONTH" as const }
const lifetime = { slug: "lifetime", price: 29900, interval: "ONE_TIME" as const }
const price = (over: Partial<StripePriceSpec> = {}): StripePriceSpec => ({
  active: true,
  unit_amount: 900,
  currency: "usd",
  recurring: { interval: "month", interval_count: 1 },
  ...over,
})

describe("testKeyProblem", () => {
  it("accepts a standard test-mode key", () => {
    expect(testKeyProblem("sk_test_abc")).toBeNull()
  })

  it("refuses a missing key, a live key and a restricted key", () => {
    expect(testKeyProblem(undefined)).toMatch(/not set/)
    expect(testKeyProblem("")).toMatch(/not set/)
    expect(testKeyProblem("sk_live_abc")).toMatch(/live-mode/)
    expect(testKeyProblem("rk_live_abc")).toMatch(/live-mode/)
    expect(testKeyProblem("rk_test_abc")).toMatch(/sk_test_/)
  })
})

describe("isPlaceholderPriceId", () => {
  it("flags the seed's placeholders and anything without the price_ prefix", () => {
    expect(isPlaceholderPriceId("price_starter_placeholder")).toBe(true)
    expect(isPlaceholderPriceId("prod_123")).toBe(true)
    expect(isPlaceholderPriceId("")).toBe(true)
  })

  it("leaves a real-looking price ID alone", () => {
    expect(isPlaceholderPriceId("price_1Q2w3E4r5T")).toBe(false)
  })
})

describe("keys", () => {
  it("gives every plan its own lookup key", () => {
    expect(lookupKeyFor("starter-monthly")).not.toBe(lookupKeyFor("starter-yearly"))
  })

  it("puts monthly and yearly of one tier under one product", () => {
    expect(productIdFor("starter-monthly")).toBe(productIdFor("starter-yearly"))
    expect(productIdFor("pro-monthly")).not.toBe(productIdFor("starter-monthly"))
    expect(productIdFor("lifetime")).toBe("plan-product-lifetime")
  })
})

describe("priceMatchesPlan", () => {
  it("matches the same amount, currency and schedule", () => {
    expect(priceMatchesPlan(price(), monthly)).toBe(true)
    expect(priceMatchesPlan(price({ unit_amount: 29900, recurring: null }), lifetime)).toBe(true)
  })

  it("rejects a different amount, currency, interval or an archived price", () => {
    expect(priceMatchesPlan(price({ unit_amount: 1900 }), monthly)).toBe(false)
    expect(priceMatchesPlan(price({ currency: "eur" }), monthly)).toBe(false)
    expect(priceMatchesPlan(price({ recurring: { interval: "year", interval_count: 1 } }), monthly)).toBe(false)
    expect(priceMatchesPlan(price({ recurring: { interval: "month", interval_count: 3 } }), monthly)).toBe(false)
    expect(priceMatchesPlan(price({ active: false }), monthly)).toBe(false)
  })

  it("does not take a recurring price for a one-time plan", () => {
    expect(priceMatchesPlan(price({ unit_amount: 29900 }), lifetime)).toBe(false)
  })
})

describe("planPriceAction", () => {
  it("leaves a stored price that matches, and one that differs, untouched", () => {
    expect(planPriceAction("matches", null)).toEqual({ kind: "up-to-date" })
    expect(planPriceAction("differs", { id: "price_x", matches: true })).toEqual({ kind: "stored-differs" })
  })

  it("reuses a matching price from an earlier run instead of creating another", () => {
    expect(planPriceAction("placeholder", { id: "price_x", matches: true })).toEqual({ kind: "use-existing", priceId: "price_x" })
  })

  it("does not reuse a lookup key whose price no longer fits the plan", () => {
    expect(planPriceAction("placeholder", { id: "price_x", matches: false })).toEqual({ kind: "lookup-conflict", priceId: "price_x" })
  })

  it("creates a price when nothing usable exists", () => {
    expect(planPriceAction("placeholder", null)).toEqual({ kind: "create" })
  })

  // A real-looking ID this account cannot find may be a live price: never overwritten.
  it("leaves a stored ID this account does not know untouched", () => {
    expect(planPriceAction("missing", null)).toEqual({ kind: "stored-unknown" })
    expect(planPriceAction("missing", { id: "price_x", matches: true })).toEqual({ kind: "stored-unknown" })
  })
})

describe("describePlanPrice", () => {
  it("formats each schedule", () => {
    expect(describePlanPrice(monthly)).toBe("$9.00 / month")
    expect(describePlanPrice({ slug: "pro-yearly", price: 19000, interval: "YEAR" })).toBe("$190.00 / year")
    expect(describePlanPrice(lifetime)).toBe("$299.00 one-time")
  })
})
