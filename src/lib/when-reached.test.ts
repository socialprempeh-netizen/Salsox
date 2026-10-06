/**
 * Tests for the "reached by scrolling" rule (when-reached.ts): a block in
 * view or already scrolled past counts, one still below the fold does not.
 */
import { describe, expect, it } from "vitest"
import { hasReached } from "./when-reached"

describe("hasReached", () => {
  it("counts a block in view, ignoring the bottom 10%", () => {
    expect(hasReached(400, 800)).toBe(true)
    expect(hasReached(750, 800)).toBe(false)
  })

  it("counts a block already scrolled past, which never intersected", () => {
    expect(hasReached(-3000, 800)).toBe(true)
  })

  it("does not count a block further down the page", () => {
    expect(hasReached(2000, 800)).toBe(false)
  })
})
