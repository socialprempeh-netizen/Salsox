/**
 * Tests for cropping a signature to its ink (image-trim.ts).
 */
import { describe, expect, it } from "vitest"
import { alphaBounds } from "./image-trim"

function image(width: number, height: number, inked: [number, number][]) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (const [x, y] of inked) data[(y * width + x) * 4 + 3] = 255
  return data
}

describe("alphaBounds", () => {
  it("finds the box around the ink", () => {
    expect(alphaBounds(image(10, 8, [[2, 3], [6, 5]]), 10, 8)).toEqual({ x: 2, y: 3, width: 5, height: 3 })
  })

  it("grows by the margin but never past the edges", () => {
    expect(alphaBounds(image(10, 8, [[1, 1], [8, 6]]), 10, 8, { margin: 3 })).toEqual({ x: 0, y: 0, width: 10, height: 8 })
  })

  it("ignores near-transparent noise and returns null for an empty image", () => {
    const faint = new Uint8ClampedArray(4 * 4 * 4)
    faint[3] = 5
    expect(alphaBounds(faint, 4, 4)).toBeNull()
  })
})
