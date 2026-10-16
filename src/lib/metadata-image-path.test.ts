/**
 * Tests for the metadata image path rule (metadata-image-path.ts): the
 * generated social cards and icons under the default locale's prefix are
 * recognised, and nothing else is, so ordinary prefixed pages still redirect.
 */
import { describe, expect, it } from "vitest"
import { isLocalizedMetadataImagePath } from "./metadata-image-path"

describe("isLocalizedMetadataImagePath", () => {
  it("recognises generated images under the default locale", () => {
    for (const path of [
      "/en/vs/docuseal/opengraph-image-1c3u1r",
      "/en/sign-and-pay/opengraph-image-cilz5r",
      "/en/esignature-for/hr/opengraph-image-ku4453",
      "/en/blog/are-electronic-signatures-legal/opengraph-image-16rwg8",
      "/en/blog/x/twitter-image",
      "/en/opengraph-image.png",
    ]) {
      expect(isLocalizedMetadataImagePath(path, "en"), path).toBe(true)
    }
  })

  it("leaves pages, other locales and look-alikes alone", () => {
    for (const path of [
      "/en/vs/docuseal",
      "/en/pricing",
      "/vs/docuseal/opengraph-image-1c3u1r",
      "/it/vs/docuseal/opengraph-image-1c3u1r",
      "/en/blog/opengraph-images-explained",
      "/en/opengraph-image-Q!",
      "/english/opengraph-image",
    ]) {
      expect(isLocalizedMetadataImagePath(path, "en"), path).toBe(false)
    }
  })
})
