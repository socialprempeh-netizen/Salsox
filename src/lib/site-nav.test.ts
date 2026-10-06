/**
 * Tests for the public navigation data (site-nav.ts): every registry page
 * lands in its group, each group ends at its hub, and empty things are left
 * out instead of rendered empty.
 */
import { describe, expect, it } from "vitest"
import { buildSiteNav, isCurrent, type NavPage, type NavText } from "./site-nav"

const text: NavText = {
  why: "Why us",
  whatYouCanDo: "What you can do",
  useCases: "Use cases",
  exploreFeatures: "Explore features",
  allUseCases: "All use cases",
  tools: "Free tools",
  allTools: "All free tools",
  toolBlurbs: {
    "sign-pdf": "a",
    "add-signature-to-pdf": "b",
    "fill-and-sign-pdf": "c",
    "request-signature": "d",
    "pdf-signature-generator": "e",
  },
  compare: "Compare",
  allComparisons: "All comparisons",
  resources: "Resources",
  blog: "Blog",
  blogBlurb: "x",
  docs: "Docs",
  docsBlurb: "x",
  verify: "Verify",
  verifyBlurb: "x",
  changelog: "Changelog",
  changelogBlurb: "x",
  faq: "FAQ",
  faqBlurb: "x",
  pricing: "Pricing",
}

const pages: NavPage[] = [
  { kind: "solution", path: "/pdf-signature", breadcrumb: "PDF signature" },
  { kind: "use-case", path: "/esignature-for/hr", breadcrumb: "HR" },
  // Alphabetical, as the registry loads them: the menu reorders.
  { kind: "tool", path: "/fill-and-sign-pdf", breadcrumb: "Fill and sign PDF", tool: "fill-and-sign-pdf" },
  { kind: "tool", path: "/sign-pdf", breadcrumb: "Sign PDF", tool: "sign-pdf" },
  { kind: "comparison", path: "/compare/docusign", breadcrumb: "vs DocuSign" },
  { kind: "alternative", path: "/alternatives/docusign", breadcrumb: "DocuSign alternative" },
]

const hrefs = (nav: ReturnType<typeof buildSiteNav>, id: string) =>
  nav.groups.find((g) => g.id === id)!.columns.flatMap((c) => c.links.map((l) => l.href))

describe("buildSiteNav", () => {
  it("puts every registry page in its group, in four groups plus Pricing", () => {
    const nav = buildSiteNav({ pages, showBlog: true, text, toolOrder: ["sign-pdf", "fill-and-sign-pdf"] })
    expect(nav.groups.map((g) => g.id)).toEqual(["why", "tools", "compare", "resources"])
    expect(hrefs(nav, "why")).toEqual(["/pdf-signature", "/#features", "/esignature-for/hr"])
    expect(hrefs(nav, "tools")).toEqual(["/sign-pdf", "/fill-and-sign-pdf"])
    expect(hrefs(nav, "compare")).toEqual(["/compare/docusign", "/alternatives/docusign"])
    expect(nav.pricing.href).toBe("/pricing")
  })

  it("ends each group at its hub page", () => {
    const nav = buildSiteNav({ pages, showBlog: true, text })
    expect(Object.fromEntries(nav.groups.map((g) => [g.id, g.footer.href]))).toEqual({
      why: "/esignature-for",
      tools: "/tools",
      compare: "/compare",
      resources: "/#faq",
    })
  })

  it("describes each tool in one line", () => {
    const nav = buildSiteNav({ pages, showBlog: true, text })
    // No order given: the registry's order stands.
    expect(nav.groups[1].columns[0].links.map((l) => l.description)).toEqual(["c", "a"])
  })

  it("leaves out the blog while it has no posts, and a group with no pages", () => {
    const nav = buildSiteNav({ pages: pages.filter((p) => p.kind !== "comparison" && p.kind !== "alternative"), showBlog: false, text })
    expect(nav.groups.map((g) => g.id)).toEqual(["why", "tools", "resources"])
    expect(hrefs(nav, "resources")).not.toContain("/blog")
  })
})

describe("isCurrent", () => {
  it("matches the page and what is below it, never a section anchor", () => {
    expect(isCurrent("/docs", "/docs/getting-started")).toBe(true)
    expect(isCurrent("/sign-pdf", "/sign-pdf")).toBe(true)
    expect(isCurrent("/sign-pdf", "/sign-pdf-online")).toBe(false)
    expect(isCurrent("/#faq", "/")).toBe(false)
  })
})
