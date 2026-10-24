import { describe, expect, it } from "vitest"
import { chargeMode, decodeCheckoutRef, encodeCheckoutRef, onAccount } from "./charge-mode"

describe("chargeMode", () => {
  it("defaults to direct charges in Stripe test mode only", () => {
    expect(chargeMode({ STRIPE_SECRET_KEY: "sk_test_abc" })).toBe("direct")
    expect(chargeMode({ STRIPE_SECRET_KEY: "sk_live_abc" })).toBe("destination")
    expect(chargeMode({})).toBe("destination")
  })

  it("follows an explicit choice in either mode", () => {
    expect(chargeMode({ STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_SIGN_AND_PAY_CHARGES: "direct" })).toBe("direct")
    expect(chargeMode({ STRIPE_SECRET_KEY: "sk_test_abc", STRIPE_SIGN_AND_PAY_CHARGES: " Destination " })).toBe("destination")
    expect(chargeMode({ STRIPE_SECRET_KEY: "sk_live_abc", STRIPE_SIGN_AND_PAY_CHARGES: "something else" })).toBe("destination")
  })
})

describe("checkout references", () => {
  it("round-trips a direct checkout with its account", () => {
    const ref = { mode: "direct" as const, account: "acct_123", sessionId: "cs_test_456" }
    expect(encodeCheckoutRef(ref)).toBe("direct:acct_123:cs_test_456")
    expect(decodeCheckoutRef("direct:acct_123:cs_test_456")).toEqual(ref)
    expect(onAccount(ref)).toEqual({ stripeAccount: "acct_123" })
  })

  it("reads a plain session id as a destination checkout, as every earlier one is", () => {
    expect(decodeCheckoutRef("cs_live_789")).toEqual({ mode: "destination", sessionId: "cs_live_789" })
    expect(encodeCheckoutRef({ mode: "destination", sessionId: "cs_live_789" })).toBe("cs_live_789")
    expect(onAccount(decodeCheckoutRef("cs_live_789"))).toBeUndefined()
  })
})
