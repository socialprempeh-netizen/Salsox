import { describe, expect, it } from "vitest"
import { dayKey, monthGrid, shiftMonth } from "./calendar"

describe("monthGrid", () => {
  it("covers whole Monday-first weeks around the month", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const days = monthGrid(2026, 9)
    expect(days[0].key).toBe("2026-09-28")
    expect(days.at(-1)!.key).toBe("2026-11-01")
    expect(days.length % 7).toBe(0)
    expect(days.filter((d) => d.inMonth)).toHaveLength(31)
  })

  it("needs no leading days when the 1st is a Monday, and fits February in four weeks", () => {
    // February 2027 starts on a Monday and has 28 days.
    const days = monthGrid(2027, 1)
    expect(days[0].key).toBe("2027-02-01")
    expect(days).toHaveLength(28)
  })

  it("takes six weeks when the month needs them", () => {
    // August 2027 starts on a Sunday and has 31 days.
    expect(monthGrid(2027, 7)).toHaveLength(42)
  })
})

describe("shiftMonth and dayKey", () => {
  it("crosses year boundaries", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2027, month: 0 }, -1)).toEqual({ year: 2026, month: 11 })
  })

  it("keys a date by its local day", () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
  })
})
