/**
 * Tests for the structured-data validator (validate-jsonld.ts), and through
 * it for every builder the site uses: what the site emits must pass, and the
 * validator must actually catch the mistakes it exists for.
 */
import { describe, expect, it } from "vitest"
import { validateJsonLd, validateJsonLdInHtml } from "./validate-jsonld"
import { breadcrumbJsonLd, faqPageJsonLd, itemListJsonLd, webApplicationJsonLd, webPageJsonLd } from "./jsonld"
import { organizationJsonLd, websiteJsonLd } from "@/lib/structured-data"
import { softwareApplicationJsonLd } from "@/lib/pricing-jsonld"
import { jsonLdScript } from "@/lib/json-ld"

const ok = (data: unknown) => {
  const r = validateJsonLd(data)
  expect(r.errors, r.errors.join("\n")).toEqual([])
  return r
}

describe("the site's own graphs pass", () => {
  it("Organization, WebSite and the product's offers", () => {
    ok([organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd([{ name: "Personal", price: 900, interval: "MONTH" }])])
  })

  it("page, tool, FAQ, breadcrumb and list graphs", () => {
    ok(webPageJsonLd({ path: "/online-esignature", name: "Online e-signature", description: "x", dateModified: "2026-10-06" }))
    ok(webApplicationJsonLd({ path: "/sign-pdf", name: "Sign PDF", description: "x", features: ["Draw"] }))
    ok(faqPageJsonLd([{ q: "Is it free?", a: "Yes, the tool is free." }]))
    ok(breadcrumbJsonLd([{ name: "Home", href: "/" }, { name: "Tools", href: "/tools" }]))
    ok(itemListJsonLd([{ name: "Sign PDF", path: "/sign-pdf" }]))
  })

  it("a free tool is honest about having no ratings", () => {
    const r = ok(webApplicationJsonLd({ path: "/sign-pdf", name: "Sign PDF", description: "x", features: [] }))
    expect(r.warnings.join()).toMatch(/no rating or review/)
  })

  it("an empty FAQ produces no FAQPage at all", () => {
    expect(faqPageJsonLd([])).toBeNull()
  })
})

describe("the validator catches what it is for", () => {
  it("a broken breadcrumb", () => {
    const r = validateJsonLd({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ position: 2, name: "", item: "/relative" }, { position: 3, name: "x" }] })
    expect(r.errors.length).toBeGreaterThanOrEqual(3)
  })

  it("an FAQ without answers, an article without a date, an app without a price", () => {
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: "Q?" }] }).errors).not.toEqual([])
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "Article", headline: "H" }).errors).not.toEqual([])
    expect(validateJsonLd({ "@context": "https://schema.org", "@type": "WebApplication", name: "A", offers: {} }).errors).not.toEqual([])
  })

  it("a wrong context and a missing type", () => {
    expect(validateJsonLd({ "@context": "https://example.com", "@type": "WebSite", name: "x", url: "https://x.y" }).errors).not.toEqual([])
    expect(validateJsonLd({ "@context": "https://schema.org" }).errors).toEqual(["json-ld[0]: missing @type"])
  })

  it("reads every block out of served HTML, including escaped ones, and flags bad JSON", () => {
    const html = `<script type="application/ld+json">${jsonLdScript(websiteJsonLd())}</script><script type="application/ld+json">{oops</script>`
    const r = validateJsonLdInHtml(html)
    expect(r.types).toContain("WebSite")
    expect(r.errors).toEqual(["page block 2: not valid JSON"])
  })
})
