/** Orphans: no link in from another page, self-links ignored, home exempt. */
import { describe, expect, it } from "vitest"
import { findOrphans, inboundCounts } from "./orphans"

describe("findOrphans", () => {
  const pages = [
    { path: "/", internalLinks: ["/pricing", "/blog"] },
    { path: "/pricing", internalLinks: ["/", "/pricing"] },
    { path: "/blog", internalLinks: ["/blog/a/", "/blog?x=1"] },
    { path: "/blog/a", internalLinks: [] },
    { path: "/blog/lonely", internalLinks: ["/blog/lonely", "/pricing"] },
    { path: "/vs/x/", internalLinks: [] },
  ]

  it("counts links in, ignoring self-links, query strings and trailing slashes", () => {
    const counts = inboundCounts(pages)
    expect(counts.get("/pricing")).toBe(2)
    expect(counts.get("/blog")).toBe(1)
    expect(counts.get("/blog/a")).toBe(1)
    expect(counts.get("/blog/lonely")).toBe(0)
  })

  it("lists pages with no link in, never the home page", () => {
    expect(findOrphans(pages)).toEqual(["/blog/lonely", "/vs/x"])
    expect(findOrphans([{ path: "/", internalLinks: [] }])).toEqual([])
  })
})
