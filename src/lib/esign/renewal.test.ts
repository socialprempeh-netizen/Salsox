import { describe, expect, it } from "vitest"
import { isRenewalNoticeDue } from "./renewal"

const now = new Date("2026-09-29T00:00:00Z")
const day = 24 * 60 * 60 * 1000
const base = {
  status: "ACTIVE",
  cancelAtPeriodEnd: false,
  currentPeriodStart: new Date(now.getTime() - 25 * day),
  currentPeriodEnd: new Date(now.getTime() + 5 * day),
  renewalNoticeSentAt: null,
  interval: "MONTH" as const,
}

describe("isRenewalNoticeDue", () => {
  it("is due inside the lead window", () => {
    expect(isRenewalNoticeDue(base, now)).toBe(true)
  })
  it("waits until the lead window", () => {
    expect(isRenewalNoticeDue({ ...base, currentPeriodEnd: new Date(now.getTime() + 10 * day) }, now)).toBe(false)
    // Yearly plans get a longer lead.
    expect(isRenewalNoticeDue({ ...base, interval: "YEAR", currentPeriodEnd: new Date(now.getTime() + 10 * day) }, now)).toBe(true)
  })
  it("is sent once per period", () => {
    expect(isRenewalNoticeDue({ ...base, renewalNoticeSentAt: new Date(now.getTime() - day) }, now)).toBe(false)
    // A notice from before this period started belonged to the previous one.
    expect(isRenewalNoticeDue({ ...base, renewalNoticeSentAt: new Date(now.getTime() - 40 * day) }, now)).toBe(true)
  })
  it("skips cancelling, inactive and one-time plans", () => {
    expect(isRenewalNoticeDue({ ...base, cancelAtPeriodEnd: true }, now)).toBe(false)
    expect(isRenewalNoticeDue({ ...base, status: "PAST_DUE" }, now)).toBe(false)
    expect(isRenewalNoticeDue({ ...base, interval: "ONE_TIME" }, now)).toBe(false)
  })
})
