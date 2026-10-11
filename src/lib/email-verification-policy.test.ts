/**
 * Tests for the email confirmation rule (email-verification-policy.ts):
 * required exactly when the confirmation email can be sent.
 */
import { describe, expect, it } from "vitest"
import { emailVerificationRequired } from "./email-verification-policy"

describe("emailVerificationRequired", () => {
  it("is required when email is configured", () => {
    expect(emailVerificationRequired({ RESEND_API_KEY: "re_123" })).toBe(true)
  })

  it("is not required when no confirmation email could be sent", () => {
    expect(emailVerificationRequired({})).toBe(false)
    expect(emailVerificationRequired({ RESEND_API_KEY: "" })).toBe(false)
    expect(emailVerificationRequired({ RESEND_API_KEY: "   " })).toBe(false)
  })
})
