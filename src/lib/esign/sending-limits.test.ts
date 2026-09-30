/**
 * Tests for the sending rules: who may email recipients, and how much per day.
 * Pure functions, so no database is involved (see sending-limits.ts).
 */
import { describe, expect, it } from "vitest"
import {
  DAILY_LIMITS,
  dailyWindowStart,
  emailConfirmationRequired,
  senderTrust,
  sendingBlocker,
  type SenderFacts,
} from "./sending-limits"

const now = new Date("2026-09-30T12:00:00Z")
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

function sender(over: Partial<SenderFacts> = {}): SenderFacts {
  return { emailVerified: true, accountCreatedAt: daysAgo(30), usage: { documents: 0, recipients: 0 }, ...over }
}

describe("emailConfirmationRequired", () => {
  it("is on only when email can actually be sent", () => {
    expect(emailConfirmationRequired({ RESEND_API_KEY: "re_123" })).toBe(true)
    expect(emailConfirmationRequired({ RESEND_API_KEY: "" })).toBe(false)
    expect(emailConfirmationRequired({})).toBe(false)
  })
})

describe("senderTrust", () => {
  it("treats the first week as new", () => {
    expect(senderTrust(daysAgo(0), now)).toBe("NEW")
    expect(senderTrust(daysAgo(6.9), now)).toBe("NEW")
    expect(senderTrust(daysAgo(7), now)).toBe("ESTABLISHED")
  })
})

describe("dailyWindowStart", () => {
  it("is 24 hours back", () => {
    expect(dailyWindowStart(now).toISOString()).toBe("2026-09-29T12:00:00.000Z")
  })
})

describe("sendingBlocker", () => {
  it("lets a confirmed sender under the ceiling send", () => {
    expect(sendingBlocker(sender(), 3, now, true)).toBeNull()
  })

  it("blocks an unconfirmed sender when confirmation is required", () => {
    expect(sendingBlocker(sender({ emailVerified: false }), 1, now, true)).toBe("emailNotConfirmed")
  })

  it("blocks an unconfirmed sender from reminders and renewals too", () => {
    expect(sendingBlocker(sender({ emailVerified: false }), 0, now, true)).toBe("emailNotConfirmed")
  })

  it("does not ask for confirmation where none can be sent", () => {
    expect(sendingBlocker(sender({ emailVerified: false }), 1, now, false)).toBeNull()
  })

  it("stops at the daily document ceiling", () => {
    const limit = DAILY_LIMITS.ESTABLISHED.documents
    expect(sendingBlocker(sender({ usage: { documents: limit - 1, recipients: 0 } }), 1, now, true)).toBeNull()
    expect(sendingBlocker(sender({ usage: { documents: limit, recipients: 0 } }), 1, now, true)).toBe("dailyLimit")
  })

  it("stops when this send would pass the daily recipient ceiling", () => {
    const limit = DAILY_LIMITS.ESTABLISHED.recipients
    const usage = { documents: 1, recipients: limit - 2 }
    expect(sendingBlocker(sender({ usage }), 2, now, true)).toBeNull()
    expect(sendingBlocker(sender({ usage }), 3, now, true)).toBe("dailyLimit")
  })

  it("gives a new account the lower ceiling", () => {
    const usage = { documents: DAILY_LIMITS.NEW.documents, recipients: 0 }
    expect(sendingBlocker(sender({ accountCreatedAt: daysAgo(1), usage }), 1, now, true)).toBe("dailyLimit")
    expect(sendingBlocker(sender({ accountCreatedAt: daysAgo(30), usage }), 1, now, true)).toBeNull()
  })

  it("never counts a reminder or renewal against the ceiling", () => {
    const usage = { documents: 999, recipients: 999 }
    expect(sendingBlocker(sender({ usage }), 0, now, true)).toBeNull()
  })
})
