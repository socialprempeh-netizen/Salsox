/**
 * Tests for the field-placement diagnostics (placement-diagnostics.ts): each
 * combination of facts maps to the case that names its cause, only real
 * misses are reported, and element descriptions carry no text content.
 */
import { describe, expect, it } from "vitest"
import { classifyPlacement, describeElement, isPlacementMiss, pointInRects, type PlacementFacts } from "./placement-diagnostics"

const facts = (patch: Partial<PlacementFacts>): PlacementFacts => ({ insidePage: true, onOverlay: true, onField: false, handlerRan: true, placed: false, ...patch })

describe("classifyPlacement", () => {
  it("is placed whenever a field appeared", () => {
    expect(classifyPlacement(facts({ placed: true }))).toBe("placed")
    expect(classifyPlacement(facts({ placed: true, onOverlay: false }))).toBe("placed")
  })

  it("names an element covering the page", () => {
    expect(classifyPlacement(facts({ onOverlay: false, handlerRan: false }))).toBe("covered")
  })

  it("tells a handler that never ran from one that ran and placed nothing", () => {
    expect(classifyPlacement(facts({ handlerRan: false }))).toBe("handler-not-called")
    expect(classifyPlacement(facts({}))).toBe("handler-no-field")
  })

  it("ignores clicks away from the pages and on existing fields", () => {
    expect(classifyPlacement(facts({ insidePage: false, onOverlay: false, handlerRan: false }))).toBe("outside-page")
    expect(classifyPlacement(facts({ onField: true, handlerRan: false }))).toBe("on-existing-field")
  })
})

describe("isPlacementMiss", () => {
  it("reports only clicks that should have placed a field", () => {
    expect(["covered", "handler-not-called", "handler-no-field"].every((o) => isPlacementMiss(o as never))).toBe(true)
    expect(["placed", "outside-page", "on-existing-field"].some((o) => isPlacementMiss(o as never))).toBe(false)
  })
})

describe("pointInRects", () => {
  const rects = [{ left: 10, top: 10, right: 110, bottom: 210 }]
  it("includes the inside and the edges", () => {
    expect(pointInRects(50, 50, rects)).toBe(true)
    expect(pointInRects(10, 210, rects)).toBe(true)
  })
  it("excludes the outside", () => {
    expect(pointInRects(5, 50, rects)).toBe(false)
    expect(pointInRects(50, 211, [])).toBe(false)
  })
})

describe("describeElement", () => {
  it("describes by tag, role, page and classes", () => {
    const attrs: Record<string, string> = { role: "img", "data-page": "2" }
    const el = { tagName: "DIV", id: "", className: "relative w-full overflow-hidden border bg-white shadow-sm", getAttribute: (n: string) => attrs[n] ?? null }
    expect(describeElement(el)).toBe("div[role=img][data-page=2].relative.w-full.overflow-hidden.border.bg-white")
  })
  it("copes with SVG class objects and no element", () => {
    expect(describeElement({ tagName: "svg", className: { baseVal: "x" } })).toBe("svg")
    expect(describeElement(null)).toBe("none")
  })
})
