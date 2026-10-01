import { describe, expect, it } from "vitest"
import { chooseProvider, defaultProviderFor, formatMinorUnits, isSignAndPayCurrency, SIGN_AND_PAY_CURRENCIES, toMinorUnits } from "./select"

describe("defaultProviderFor", () => {
  it("routes African currencies to Paystack", () => {
    expect(defaultProviderFor("ghs")).toBe("PAYSTACK")
    expect(defaultProviderFor("NGN")).toBe("PAYSTACK")
    expect(defaultProviderFor("USD")).toBe("STRIPE")
  })
})

describe("chooseProvider", () => {
  it("honours a requested provider the sender can be paid on", () => {
    expect(chooseProvider("GHS", ["STRIPE", "PAYSTACK"], "STRIPE")).toBe("STRIPE")
  })
  it("falls back to the currency default, then to anything connected", () => {
    expect(chooseProvider("GHS", ["STRIPE", "PAYSTACK"])).toBe("PAYSTACK")
    expect(chooseProvider("GHS", ["STRIPE"])).toBe("STRIPE")
    expect(chooseProvider("USD", [])).toBeNull()
  })
})

describe("toMinorUnits", () => {
  it("parses without floating-point drift", () => {
    expect(toMinorUnits("12.29")).toBe(1229)
    expect(toMinorUnits("5")).toBe(500)
    expect(toMinorUnits("1,000.5")).toBe(100050)
  })
  it("rejects malformed amounts", () => {
    expect(toMinorUnits("abc")).toBeNull()
    expect(toMinorUnits("1.234")).toBeNull()
    expect(toMinorUnits("-3")).toBeNull()
  })
})

describe("formatMinorUnits", () => {
  it("formats in major units", () => {
    expect(formatMinorUnits(1250, "usd")).toBe("$12.50")
  })
})

describe("isSignAndPayCurrency", () => {
  it("accepts exactly the offered codes", () => {
    for (const currency of SIGN_AND_PAY_CURRENCIES) expect(isSignAndPayCurrency(currency)).toBe(true)
    for (const currency of ["JPY", "KRW", "usd", "", "USD "]) expect(isSignAndPayCurrency(currency)).toBe(false)
  })

  // The assumption the whole flow rests on: every offered currency has two
  // decimal places, so "minor units / 100" is the amount the signer was shown.
  it("offers only currencies with two decimal places", () => {
    for (const currency of SIGN_AND_PAY_CURRENCIES) {
      expect(new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits).toBe(2)
    }
  })
})
