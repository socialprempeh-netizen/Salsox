/**
 * Tests for the sender account countries (stripe-countries.ts): the server
 * accepts exactly what the picker offers, and the picker reads well.
 */
import { describe, expect, it } from "vitest"
import { STRIPE_CONNECT_COUNTRIES, isStripeConnectCountry, stripeCountryOptions } from "./stripe-countries"

describe("isStripeConnectCountry", () => {
  it("accepts listed countries", () => {
    expect(isStripeConnectCountry("GB")).toBe(true)
    expect(isStripeConnectCountry("US")).toBe(true)
  })

  it("refuses anything else, including lower case, unsupported and non-strings", () => {
    for (const bad of ["gb", "GH", "NG", "IN", "", "GBR", null, undefined, 44]) {
      expect(isStripeConnectCountry(bad)).toBe(false)
    }
  })
})

describe("stripeCountryOptions", () => {
  it("offers every listed country once, named and sorted by name", () => {
    const options = stripeCountryOptions("en")
    expect(options.map((o) => o.code).sort()).toEqual([...STRIPE_CONNECT_COUNTRIES].sort())
    expect(options.find((o) => o.code === "GB")?.name).toBe("United Kingdom")
    const names = options.map((o) => o.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")))
  })
})
