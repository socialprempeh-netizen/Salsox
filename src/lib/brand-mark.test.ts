/**
 * Tests for reading the deployment's mark setting (brand-mark.ts): a public
 * path or an absolute URL is accepted, anything that climbs out of public/
 * or is not an image is not.
 */
import { describe, expect, it } from "vitest"
import { markImageSrc, markSource } from "./brand-mark"

describe("markSource", () => {
  it("reads a path under public/ and an absolute URL", () => {
    expect(markSource("/brand/mark.png")).toEqual({ file: "brand/mark.png" })
    expect(markSource("brand/mark.svg")).toEqual({ file: "brand/mark.svg" })
    expect(markSource("https://cdn.example.com/mark.png")).toEqual({ url: "https://cdn.example.com/mark.png" })
  })

  it("refuses an empty value, a path out of public/ and a non-image", () => {
    expect(markSource("")).toBeNull()
    expect(markSource(undefined)).toBeNull()
    expect(markSource("/../.env.local")).toBeNull()
    expect(markSource("/brand/../../package.json")).toBeNull()
    expect(markSource("/brand/notes.txt")).toBeNull()
  })
})

describe("markImageSrc", () => {
  it("inlines a file that exists and gives up on one that does not", () => {
    expect(markImageSrc("/brand/mark.png")).toMatch(/^data:image\/png;base64,iVBORw0KGgo/)
    expect(markImageSrc("/brand/missing.png")).toBeNull()
  })
})
