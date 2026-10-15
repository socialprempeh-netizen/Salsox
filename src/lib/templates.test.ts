/**
 * Tests for the free templates registry (templates.ts) and their PDF
 * (templates-pdf.ts): every file in content/templates parses, passes the
 * publishing rules, and renders to a PDF the built-in fonts can encode.
 */
import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import {
  getTemplates,
  relatedTemplates,
  TEMPLATE_CATEGORIES,
  templatePlaceholders,
  templatePlainText,
  validateTemplates,
} from "./templates"
import { renderTemplatePdf, toWinAnsi } from "./templates-pdf"

const templates = getTemplates()

describe("the template registry", () => {
  it("has between 15 and 20 templates, covering every category", () => {
    expect(templates.length).toBeGreaterThanOrEqual(15)
    expect(templates.length).toBeLessThanOrEqual(20)
    for (const category of TEMPLATE_CATEGORIES) expect(templates.some((t) => t.category === category), category).toBe(true)
  })

  it("passes every publishing rule", () => {
    expect(validateTemplates(templates)).toEqual([])
  })

  it("fills in the product name", () => {
    expect(templates.some((t) => JSON.stringify(t).includes("{site}"))).toBe(false)
  })

  it("lists related templates from the same category first, never itself", () => {
    const nda = templates.find((t) => t.slug === "mutual-nda")!
    const related = relatedTemplates(nda, templates)
    expect(related.map((t) => t.slug)).not.toContain("mutual-nda")
    expect(related[0].category).toBe("nda")
  })
})

describe("templatePlainText", () => {
  it("drops Markdown syntax and keeps the words", () => {
    const md = "## 1. Terms\n\n**Party A:** [Name]\n- first point\n\n| Item | Amount |\n|---|---|\n| Fee | 10 |"
    expect(templatePlainText(md)).toBe("1. Terms\n\nParty A: [Name]\n• first point\n\nItem  |  Amount\nFee  |  10")
  })

  it("finds the blanks to fill in", () => {
    expect(templatePlaceholders("Between [Party A] and [Party B], on [Date] and [Date].")).toEqual(["[Party A]", "[Party B]", "[Date]"])
  })
})

describe("renderTemplatePdf", () => {
  it("replaces characters the built-in fonts cannot encode", () => {
    expect(toWinAnsi("Fee → 5 ≥ 3 ₵ “ok” — fine")).toBe("Fee -> 5 >= 3 ? “ok” — fine")
  })

  it.each(templates.map((t) => [t.slug, t] as const))("renders %s", async (_slug, template) => {
    const bytes = await renderTemplatePdf({ title: template.h1, markdown: template.body, footer: "Template from Example, example.com" })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(pdf.getPageCount()).toBeLessThanOrEqual(4)
  })
})
