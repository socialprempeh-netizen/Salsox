/**
 * Tests for the per-page trail and structured data (page-graph.ts): every
 * real page's graph validates, tools are WebApplications, and an FAQPage
 * appears exactly when the page prints questions.
 */
import { describe, expect, it } from "vitest"
import { getPages } from "./pages"
import { pageGraph, pageTrail } from "./page-graph"
import { validateJsonLd } from "./validate-jsonld"

const labels = { home: "Home", tools: "Free tools", compare: "Compare", useCases: "Use cases" }
const types = (graphs: object[]) => graphs.map((g) => (g as { "@type": string })["@type"])

describe("pageTrail", () => {
  it("puts tools, comparisons and use cases under their hub", () => {
    expect(pageTrail({ kind: "tool", path: "/sign-pdf", breadcrumb: "Sign PDF" }, labels).map((c) => c.href)).toEqual(["/", "/tools", "/sign-pdf"])
    expect(pageTrail({ kind: "alternative", path: "/alternatives/docusign", breadcrumb: "x" }, labels).map((c) => c.href)).toEqual(["/", "/compare", "/alternatives/docusign"])
    expect(pageTrail({ kind: "solution", path: "/online-esignature", breadcrumb: "x" }, labels).map((c) => c.href)).toEqual(["/", "/online-esignature"])
  })
})

describe("pageGraph", () => {
  it("validates for every real page", () => {
    for (const page of getPages()) {
      const report = validateJsonLd(pageGraph(page, pageTrail(page, labels)), page.path)
      expect(report.errors, report.errors.join("\n")).toEqual([])
    }
  })

  it("marks tools as free web applications, and only tools", () => {
    for (const page of getPages()) {
      expect(types(pageGraph(page, pageTrail(page, labels))).includes("WebApplication")).toBe(page.kind === "tool")
    }
  })

  it("adds an FAQPage only from questions the page prints", () => {
    const page = getPages()[0]
    expect(types(pageGraph(page, []))).toContain("FAQPage")
    expect(types(pageGraph({ ...page, faq: [] }, []))).not.toContain("FAQPage")
  })
})
