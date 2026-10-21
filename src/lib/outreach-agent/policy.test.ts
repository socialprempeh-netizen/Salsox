import { describe, expect, it } from "vitest"
import { MAX_DAILY_CAP, REVIEW_FIRST, clampCap, followUpCutoff, followUpDue, remainingToday, reviewsLeft, shouldAutoSend, startOfDayUtc } from "./policy"

describe("shouldAutoSend", () => {
  it("holds the first batch for review", () => {
    expect(shouldAutoSend({ sentBefore: REVIEW_FIRST - 1, reviewEvery: false, paused: false })).toBe(false)
    expect(shouldAutoSend({ sentBefore: REVIEW_FIRST, reviewEvery: false, paused: false })).toBe(true)
  })

  it("holds everything when review-every is on or sending is paused", () => {
    expect(shouldAutoSend({ sentBefore: 50, reviewEvery: true, paused: false })).toBe(false)
    expect(shouldAutoSend({ sentBefore: 50, reviewEvery: false, paused: true })).toBe(false)
  })
})

describe("reviewsLeft", () => {
  it("counts down to zero", () => {
    expect(reviewsLeft(0)).toBe(REVIEW_FIRST)
    expect(reviewsLeft(REVIEW_FIRST + 3)).toBe(0)
  })
})

describe("followUpDue", () => {
  const now = new Date("2026-10-21T12:00:00Z")
  const base = { hasFollowUp: false, replied: false, unsubscribed: false, now }

  it("is due three days after the first email", () => {
    expect(followUpDue({ ...base, firstSentAt: new Date("2026-10-18T12:00:00Z") })).toBe(true)
    expect(followUpDue({ ...base, firstSentAt: new Date("2026-10-18T12:00:01Z") })).toBe(false)
  })

  it("is never due twice, after a reply, after an unsubscribe, or before a first email", () => {
    const old = new Date("2026-10-01T00:00:00Z")
    expect(followUpDue({ ...base, firstSentAt: old, hasFollowUp: true })).toBe(false)
    expect(followUpDue({ ...base, firstSentAt: old, replied: true })).toBe(false)
    expect(followUpDue({ ...base, firstSentAt: old, unsubscribed: true })).toBe(false)
    expect(followUpDue({ ...base, firstSentAt: null })).toBe(false)
  })

  it("agrees with followUpCutoff", () => {
    expect(followUpCutoff(now).toISOString()).toBe("2026-10-18T12:00:00.000Z")
  })
})

describe("daily cap", () => {
  it("counts what is left today", () => {
    expect(remainingToday(20, 5)).toBe(15)
    expect(remainingToday(20, 25)).toBe(0)
  })

  it("clamps the cap to 1..MAX", () => {
    expect(clampCap(0)).toBe(1)
    expect(clampCap(1000)).toBe(MAX_DAILY_CAP)
    expect(clampCap(Number.NaN)).toBe(20)
    expect(clampCap(7.9)).toBe(7)
  })

  it("starts the day at midnight UTC", () => {
    expect(startOfDayUtc(new Date("2026-10-21T23:59:00Z")).toISOString()).toBe("2026-10-21T00:00:00.000Z")
  })
})
