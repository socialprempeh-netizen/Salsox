/** Tests for the webhook retry schedule (retry.ts). */
import { describe, expect, it } from "vitest"
import { isSuccess, MAX_ATTEMPTS, nextAttemptAt } from "./retry"

describe("retry schedule", () => {
  const now = new Date("2026-10-25T12:00:00Z")

  it("waits longer after each failure", () => {
    expect(nextAttemptAt(1, now)?.toISOString()).toBe("2026-10-25T12:01:00.000Z")
    expect(nextAttemptAt(2, now)?.toISOString()).toBe("2026-10-25T12:05:00.000Z")
    expect(nextAttemptAt(6, now)?.toISOString()).toBe("2026-10-26T12:00:00.000Z")
  })

  it("gives up after the last attempt", () => {
    expect(MAX_ATTEMPTS).toBe(7)
    expect(nextAttemptAt(7, now)).toBeNull()
  })

  it("counts any 2xx as received", () => {
    expect(isSuccess(200)).toBe(true)
    expect(isSuccess(204)).toBe(true)
    expect(isSuccess(301)).toBe(false)
    expect(isSuccess(500)).toBe(false)
  })
})
