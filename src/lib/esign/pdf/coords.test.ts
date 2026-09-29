import { describe, expect, it } from "vitest"
import { clientToPercent, fitInside, percentToPdfRect } from "./coords"

describe("percentToPdfRect", () => {
  it("flips y to the bottom-left origin", () => {
    // A4 portrait in points.
    const r = percentToPdfRect({ x: 10, y: 0, width: 50, height: 10 }, 600, 800)
    expect(r).toEqual({ x: 60, y: 720, width: 300, height: 80 })
  })
  it("puts a field at the bottom of the page at y=0", () => {
    const r = percentToPdfRect({ x: 0, y: 90, width: 100, height: 10 }, 600, 800)
    expect(r.y).toBeCloseTo(0)
  })
})

describe("clientToPercent", () => {
  it("converts and clamps pointer positions", () => {
    const box = { left: 100, top: 50, width: 200, height: 400 }
    expect(clientToPercent(200, 250, box)).toEqual({ x: 50, y: 50 })
    expect(clientToPercent(0, 999, box)).toEqual({ x: 0, y: 100 })
  })
})

describe("fitInside", () => {
  it("keeps aspect ratio and centres", () => {
    const r = fitInside(200, 100, { x: 0, y: 0, width: 100, height: 100 })
    expect(r).toEqual({ x: 0, y: 25, width: 100, height: 50 })
  })
})
