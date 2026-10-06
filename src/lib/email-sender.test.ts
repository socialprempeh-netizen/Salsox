/**
 * Tests for the sender-address check (email-sender.ts): a real domain passes;
 * Resend's test sender and the example placeholders are refused.
 */
import { describe, expect, it } from "vitest"
import { senderAddress, senderAddressProblem } from "./email-sender"

describe("senderAddress", () => {
  it("reads both forms", () => {
    expect(senderAddress("Salsox <Hello@Salsox.com>")).toBe("hello@salsox.com")
    expect(senderAddress("hello@salsox.com")).toBe("hello@salsox.com")
    expect(senderAddress("Salsox")).toBeNull()
  })
})

describe("senderAddressProblem", () => {
  it("accepts a sender on your own domain, and an unset one", () => {
    expect(senderAddressProblem("Salsox <hello@salsox.com>")).toBeNull()
    expect(senderAddressProblem("")).toBeNull()
    expect(senderAddressProblem(undefined)).toBeNull()
  })

  it("refuses Resend's test sender, which only reaches the account owner", () => {
    expect(senderAddressProblem("Acme <onboarding@resend.dev>")).toBe("resendTestSender")
  })

  it("refuses the placeholders that are never verified", () => {
    expect(senderAddressProblem("Acme <hello@yourdomain.com>")).toBe("placeholder")
    expect(senderAddressProblem("noreply@example.com")).toBe("placeholder")
    expect(senderAddressProblem("Salsox")).toBe("unparseable")
  })
})
