import { describe, it, expect } from "vitest"

import { siteConfig } from "@/config/site"
import { aboutPageJsonLd, organizationJsonLd, techArticleJsonLd, websiteJsonLd } from "./structured-data"

describe("organizationJsonLd", () => {
  it("describes the site's publisher from siteConfig", () => {
    expect(organizationJsonLd()).toMatchObject({
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      logo: `${siteConfig.url}/icon`,
    })
  })

  // An unset profile is null in siteConfig; a null in sameAs is invalid.
  it("leaves unset profiles out of sameAs", () => {
    expect(organizationJsonLd().sameAs.every(Boolean)).toBe(true)
  })
})

describe("websiteJsonLd", () => {
  // The two graphs are separate scripts on the page: the @id is what joins them.
  it("points its publisher at the organization's @id", () => {
    expect(websiteJsonLd().publisher["@id"]).toBe(organizationJsonLd()["@id"])
  })
})

describe("aboutPageJsonLd", () => {
  it("is about the same organization, at an absolute URL", () => {
    const out = aboutPageJsonLd()
    expect(out.url).toBe(`${siteConfig.url}/about`)
    expect(out.mainEntity).toEqual(organizationJsonLd())
  })
})

describe("techArticleJsonLd", () => {
  it("builds absolute URLs from a site path", () => {
    const out = techArticleJsonLd({ title: "Projects", path: "/docs/projects", inLanguage: "en" })
    expect(out.url).toBe(`${siteConfig.url}/docs/projects`)
    expect(out.mainEntityOfPage).toBe(out.url)
  })

  it("omits a missing description instead of declaring it empty", () => {
    expect(techArticleJsonLd({ title: "T", path: "/docs/t", inLanguage: "en" })).not.toHaveProperty("description")
  })
})
