/**
 * Tests for the email outcome channel: a report reaches the caller that is
 * capturing, only that caller, and nobody when no one is.
 */
import { describe, expect, it } from "vitest"
import { captureEmailOutcome, reportEmailOutcome } from "./email-outcome"

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe("captureEmailOutcome", () => {
  it("returns an accepted report made deep in the call chain", async () => {
    const { result, outcome } = await captureEmailOutcome(async () => {
      await tick(1)
      reportEmailOutcome(true)
      return "done"
    })
    expect(result).toBe("done")
    expect(outcome).toBe(true)
  })

  it("returns a refusal", async () => {
    const { outcome } = await captureEmailOutcome(async () => reportEmailOutcome(false))
    expect(outcome).toBe(false)
  })

  it("is undefined when no email was attempted", async () => {
    const { outcome } = await captureEmailOutcome(async () => "nothing sent")
    expect(outcome).toBeUndefined()
  })

  it("keeps concurrent captures apart", async () => {
    const [slow, fast] = await Promise.all([
      captureEmailOutcome(async () => {
        await tick(10)
        reportEmailOutcome(false)
      }),
      captureEmailOutcome(async () => {
        await tick(1)
        reportEmailOutcome(true)
      }),
    ])
    expect(slow.outcome).toBe(false)
    expect(fast.outcome).toBe(true)
  })

  it("lets an error from the send through", async () => {
    await expect(
      captureEmailOutcome(async () => {
        throw new Error("network down")
      })
    ).rejects.toThrow("network down")
  })
})

describe("reportEmailOutcome", () => {
  it("does nothing when nobody is capturing", () => {
    expect(() => reportEmailOutcome(true)).not.toThrow()
  })
})
