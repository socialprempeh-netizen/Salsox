import { describe, expect, it } from "vitest"
import { filledSegments } from "./meter"

describe("filledSegments", () => {
  it("fills none for no value, zero or a negative rate", () => {
    expect(filledSegments(null, 10)).toBe(0)
    expect(filledSegments(undefined, 10)).toBe(0)
    expect(filledSegments(Number.NaN, 10)).toBe(0)
    expect(filledSegments(0, 10)).toBe(0)
    expect(filledSegments(-0.4, 10)).toBe(0)
  })

  it("fills all for a full or overfull rate", () => {
    expect(filledSegments(1, 10)).toBe(10)
    expect(filledSegments(1.7, 12)).toBe(12)
  })

  it("rounds to the nearest square in between", () => {
    expect(filledSegments(0.5, 10)).toBe(5)
    expect(filledSegments(0.34, 10)).toBe(3)
    expect(filledSegments(0.36, 10)).toBe(4)
  })

  it("lights one square for any rate above zero", () => {
    expect(filledSegments(0.01, 10)).toBe(1)
  })

  it("keeps the last square empty until the rate is complete", () => {
    expect(filledSegments(0.98, 10)).toBe(9)
  })

  it("fills nothing for a meter with no squares", () => {
    expect(filledSegments(0.5, 0)).toBe(0)
    expect(filledSegments(0.5, Number.NaN)).toBe(0)
  })
})
