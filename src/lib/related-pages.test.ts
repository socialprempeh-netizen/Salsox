import { describe, it, expect } from "vitest"

import { RELATED_HREF, relatedPagesFor } from "./related-pages"

describe("relatedPagesFor", () => {
  it("never suggests the page the reader is on", () => {
    for (const href of Object.values(RELATED_HREF)) {
      expect(relatedPagesFor(href, 10).map((p) => p.href)).not.toContain(href)
    }
  })

  it("keeps the declared order and respects the limit", () => {
    expect(relatedPagesFor("/about").map((p) => p.key)).toEqual(["pricing", "docs", "contact"])
    expect(relatedPagesFor("/about", 2)).toHaveLength(2)
  })

  it("skips hidden sections and fills the row from the next in line", () => {
    expect(relatedPagesFor("/no-such-page", 3, ["blog"]).map((p) => p.key)).toEqual(["pricing", "docs", "contact"])
  })

  // The 404 page and anything not listed get a sensible default set.
  it("falls back to the default neighbours for an unknown path", () => {
    expect(relatedPagesFor("/no-such-page").map((p) => p.href)).toEqual(["/pricing", "/docs", "/blog"])
  })
})
