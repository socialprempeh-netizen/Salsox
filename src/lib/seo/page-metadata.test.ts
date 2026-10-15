/**
 * Tests for registry page metadata (page-metadata.ts). The one that matters
 * most: the Open Graph and Twitter objects carry no `images` key at all, since
 * a key set even to undefined stops Next from using the route's generated
 * opengraph-image, and the page is shared with no preview image.
 */
import { describe, expect, it } from "vitest"
import { getPages } from "./pages"
import { sitePageMetadata, withoutImages } from "./page-metadata"

describe("withoutImages", () => {
  it("removes the key rather than setting it to undefined", () => {
    const out = withoutImages({ title: "t", images: [{ url: "/og.png" }] })
    expect(out).toEqual({ title: "t" })
    expect(out && "images" in out).toBe(false)
  })

  it("passes nothing through as nothing", () => {
    expect(withoutImages(undefined)).toBeUndefined()
  })
})

describe("sitePageMetadata", () => {
  it("leaves every registry page's social image to its opengraph-image file", () => {
    const pages = getPages()
    expect(pages.length).toBeGreaterThan(0)
    for (const page of pages) {
      const meta = sitePageMetadata(page)
      expect(meta.openGraph && "images" in meta.openGraph, page.path).toBe(false)
      expect(meta.twitter && "images" in meta.twitter, page.path).toBe(false)
      expect(meta.alternates?.canonical, page.path).toMatch(new RegExp(`${page.path}$`))
    }
  })
})
