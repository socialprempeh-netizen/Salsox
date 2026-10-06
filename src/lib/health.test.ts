/**
 * Tests for the database liveness rule behind /api/health (health.ts): a
 * database that answers is up, one that throws or hangs past the timeout is
 * down, and down is a 503.
 */
import { describe, expect, it } from "vitest"
import { checkDatabase, healthStatusCode } from "./health"

describe("checkDatabase", () => {
  it("is ok when the ping resolves", async () => {
    const result = await checkDatabase(async () => [{ "?column?": 1 }])
    expect(result.ok).toBe(true)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
  })

  it("is down when the ping throws", async () => {
    const result = await checkDatabase(async () => {
      throw new Error("connection refused")
    })
    expect(result.ok).toBe(false)
  })

  // A hung connection is the outage a monitor most needs to see, and the one
  // that would otherwise hold the request open until the platform kills it.
  it("is down when the ping does not answer within the timeout", async () => {
    const result = await checkDatabase(() => new Promise(() => {}), 20)
    expect(result.ok).toBe(false)
  })

  it("measures how long the ping took", async () => {
    let t = 1000
    const result = await checkDatabase(async () => { t += 42 }, 1000, () => t)
    expect(result).toEqual({ ok: true, latencyMs: 42 })
  })
})

describe("healthStatusCode", () => {
  it("answers 200 when the database is up and 503 when it is not", () => {
    expect(healthStatusCode({ ok: true, latencyMs: 3 })).toBe(200)
    expect(healthStatusCode({ ok: false, latencyMs: 3000 })).toBe(503)
  })
})
