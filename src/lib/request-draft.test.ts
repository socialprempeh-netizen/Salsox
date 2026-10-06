/**
 * Tests for the request-draft hand-off's freshness rule (request-draft.ts).
 * The IndexedDB plumbing runs in the browser and is covered by the e2e test.
 */
import { describe, expect, it } from "vitest"
import { DRAFT_MAX_AGE_MS, isDraftFresh } from "./request-draft"

describe("isDraftFresh", () => {
  it("accepts a draft up to an hour old and nothing older or from the future", () => {
    const now = 1_000_000_000
    expect(isDraftFresh(now - 1000, now)).toBe(true)
    expect(isDraftFresh(now - DRAFT_MAX_AGE_MS, now)).toBe(true)
    expect(isDraftFresh(now - DRAFT_MAX_AGE_MS - 1, now)).toBe(false)
    expect(isDraftFresh(now + 5000, now)).toBe(false)
    expect(isDraftFresh(Number.NaN, now)).toBe(false)
  })
})
