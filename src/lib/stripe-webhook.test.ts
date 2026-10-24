import { describe, expect, it } from "vitest"
import { needsDisputeRecovery, webhookSecrets } from "./stripe-webhook"

describe("webhookSecrets", () => {
  it("tries the platform secret first, then the Connect endpoint's", () => {
    expect(webhookSecrets({ STRIPE_WEBHOOK_SECRET: "whsec_platform", STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect" })).toEqual(["whsec_platform", "whsec_connect"])
    expect(webhookSecrets({ STRIPE_WEBHOOK_SECRET: " whsec_platform " })).toEqual(["whsec_platform"])
    expect(webhookSecrets({})).toEqual([])
  })
})

describe("needsDisputeRecovery", () => {
  it("recovers only a destination charge's dispute, never a direct charge's", () => {
    expect(needsDisputeRecovery({})).toBe(true)
    expect(needsDisputeRecovery({ account: null })).toBe(true)
    expect(needsDisputeRecovery({ account: "acct_123" })).toBe(false)
  })
})
