import { describe, expect, it } from "vitest"
import { autoPlaceFields, needsSignaturePage } from "./quick-send"

describe("autoPlaceFields", () => {
  it("places a signature and a date per signer on the last page", () => {
    const fields = autoPlaceFields(3, 2)
    expect(fields).toHaveLength(4)
    expect(fields.every((f) => f.page === 3)).toBe(true)
    expect(fields.filter((f) => f.type === "SIGNATURE").map((f) => f.recipientIndex)).toEqual([0, 1])
  })

  it("keeps every field inside the page and rows from overlapping", () => {
    const fields = autoPlaceFields(1, 3)
    for (const f of fields) {
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.y).toBeGreaterThanOrEqual(0)
      expect(f.x + f.width).toBeLessThanOrEqual(100)
      expect(f.y + f.height).toBeLessThanOrEqual(100)
    }
    const sigs = fields.filter((f) => f.type === "SIGNATURE")
    for (let i = 1; i < sigs.length; i++) {
      expect(sigs[i].y).toBeGreaterThanOrEqual(sigs[i - 1].y + sigs[i - 1].height)
    }
  })

  it("moves many signers to an appended page", () => {
    expect(needsSignaturePage(4)).toBe(true)
    expect(autoPlaceFields(2, 4).every((f) => f.page === 3)).toBe(true)
  })

  it("returns nothing without signers", () => {
    expect(autoPlaceFields(2, 0)).toEqual([])
  })
})
