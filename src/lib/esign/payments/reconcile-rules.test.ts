import { describe, it, expect } from "vitest"

import { ABANDON_AFTER_MS, CHECKOUT_SETUP_GRACE_MS, existingCheckout, settlement } from "./reconcile-rules"

const base = { verified: "PAID" as const, matches: true, documentStatus: "PENDING", alreadyPaid: false, ageMs: 1000 }

describe("settlement", () => {
  it("marks a matching payment for a live document paid", () => {
    expect(settlement(base)).toEqual({ action: "markPaid" })
  })

  // The two cases that used to keep money they should not have.
  it("refunds a payment that lands after the document was cancelled or expired", () => {
    for (const documentStatus of ["CANCELLED", "EXPIRED", "REJECTED"]) {
      expect(settlement({ ...base, documentStatus })).toEqual({ action: "refund", reason: "documentClosed" })
    }
  })

  it("refunds a second payment by someone who already paid", () => {
    expect(settlement({ ...base, alreadyPaid: true })).toEqual({ action: "refund", reason: "duplicate" })
  })

  it("never keeps money that is not the amount asked for", () => {
    expect(settlement({ ...base, matches: false })).toEqual({ action: "markFailed", reason: "mismatch" })
  })

  it("fails what the provider failed", () => {
    expect(settlement({ ...base, verified: "FAILED" })).toEqual({ action: "markFailed", reason: "providerFailed" })
  })

  it("waits on an open checkout, then gives up on an abandoned one", () => {
    expect(settlement({ ...base, verified: "PENDING" })).toEqual({ action: "wait" })
    expect(settlement({ ...base, verified: "PENDING", ageMs: ABANDON_AFTER_MS })).toEqual({ action: "markFailed", reason: "abandoned" })
  })
})

describe("existingCheckout", () => {
  it("resumes the checkout already open instead of opening a second", () => {
    expect(existingCheckout({ status: "PENDING", url: "https://pay.example/1", ageMs: 5000 })).toEqual({
      action: "resume",
      url: "https://pay.example/1",
    })
  })

  it("waits for a checkout another request is still setting up", () => {
    expect(existingCheckout({ status: "PENDING", url: null, ageMs: CHECKOUT_SETUP_GRACE_MS - 1 })).toEqual({ action: "inProgress" })
  })

  it("replaces one whose setup died, and one that failed", () => {
    expect(existingCheckout({ status: "PENDING", url: null, ageMs: CHECKOUT_SETUP_GRACE_MS })).toEqual({ action: "replace" })
    expect(existingCheckout({ status: "FAILED", url: "https://pay.example/1", ageMs: 0 })).toEqual({ action: "replace" })
  })

  it("reports a payment that went through meanwhile", () => {
    expect(existingCheckout({ status: "PAID", url: null, ageMs: 0 })).toEqual({ action: "paid" })
  })
})
