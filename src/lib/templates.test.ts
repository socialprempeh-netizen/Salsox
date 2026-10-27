/**
 * Tests for the template library (templates.ts), its taxonomy and its PDF
 * (templates-pdf.ts): every file in content/templates parses, passes the
 * publishing rules, fills every industry and team page, and renders to a PDF
 * whose signing fields land inside the page, one per field token.
 */
import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import {
  fieldTokens,
  fillVariables,
  getTemplates,
  relatedTemplates,
  templateCards,
  templatePlaceholders,
  templatePlainText,
  templatesFor,
  validateTemplates,
} from "./templates"
import { INDUSTRY_IDS, TEAM_IDS, TEMPLATE_CATEGORIES, TEMPLATE_TYPES } from "./templates-taxonomy"
import { renderTemplatePdf, toWinAnsi } from "./templates-pdf"

const templates = getTemplates()

describe("the template library", () => {
  // The library is growing toward about 100 templates, so the ceiling moved.
  // It still exists to catch a runaway import, not to cap the library. Was:
  //   it("has between 40 and 60 templates", () => {
  //     expect(templates.length).toBeGreaterThanOrEqual(40)
  //     expect(templates.length).toBeLessThanOrEqual(60)
  //   })
  it("has between 40 and 120 templates", () => {
    expect(templates.length).toBeGreaterThanOrEqual(40)
    expect(templates.length).toBeLessThanOrEqual(120)
  })

  it("passes every publishing rule", () => {
    expect(validateTemplates(templates)).toEqual([])
  })

  it("covers every category and type", () => {
    for (const category of TEMPLATE_CATEGORIES) expect(templates.some((t) => t.category === category), category).toBe(true)
    for (const type of TEMPLATE_TYPES) expect(templates.some((t) => t.type === type), type).toBe(true)
  })

  it("gives every industry and team page at least three templates", () => {
    for (const industry of INDUSTRY_IDS) expect(templatesFor({ industry }).length, industry).toBeGreaterThanOrEqual(3)
    for (const team of TEAM_IDS) expect(templatesFor({ team }).length, team).toBeGreaterThanOrEqual(3)
    // Loads the whole template library from disk once per page: past the 5s
    // default when the full suite runs its workers in parallel.
  }, 30_000)

  it("fills in the product name", () => {
    expect(templates.some((t) => JSON.stringify(t).includes("{site}"))).toBe(false)
  })

  it("suggests related templates, the same category first and never itself", () => {
    const nda = templates.find((t) => t.slug === "mutual-nda")!
    const related = relatedTemplates(nda, templates)
    expect(related.length).toBeGreaterThan(0)
    expect(related.map((t) => t.slug)).not.toContain("mutual-nda")
    expect(related[0].category).toBe("nda")
  })

  it("sends the library only the fields its cards need", () => {
    const [card] = templateCards(templates)
    expect(Object.keys(card).sort()).toEqual(["category", "h1", "industries", "lede", "path", "preview", "slug", "teams", "type"])
    expect(card.preview.length).toBeGreaterThan(0)
  })
})

describe("blanks and fields", () => {
  const md = "Between [Party A] and [Party B], on [Date].\n\nSignature: [[signature:client]]   Date: [[date:client]]"

  it("finds the blanks and the field tokens", () => {
    expect(templatePlaceholders(md)).toEqual(["[Party A]", "[Party B]", "[Date]"])
    expect(fieldTokens(md)).toEqual([
      { kind: "signature", role: "client" },
      { kind: "date", role: "client" },
    ])
  })

  it("fills blanks with values, and leaves or replaces the missing ones", () => {
    expect(fillVariables("[Party A] pays [Party B].", { "Party A": "Ama" })).toBe("Ama pays [Party B].")
    expect(fillVariables("[Party A] pays [Party B].", { "Party A": "Ama" }, () => "____")).toBe("Ama pays ____.")
  })

  it("copies as plain text, fields as lines to sign on", () => {
    const text = templatePlainText("## 1. Terms\n\n**Party A:** [Name]\n- first point\n\n| Item | Amount |\n|---|---|\n| Fee | 10 |\n\nSignature: [[signature:a]]")
    expect(text).toBe("1. Terms\n\nParty A: [Name]\n• first point\n\nItem  |  Amount\nFee  |  10\n\nSignature: ____________________")
  })
})

describe("renderTemplatePdf", () => {
  it("replaces characters the built-in fonts cannot encode", () => {
    expect(toWinAnsi("Fee → 5 ≥ 3 ₵ “ok” — fine")).toBe("Fee -> 5 >= 3 ? “ok” — fine")
  })

  it.each(templates.map((t) => [t.slug, t] as const))("renders %s with every field on the page", async (_slug, template) => {
    const { bytes, fields } = await renderTemplatePdf({ title: template.h1, markdown: fillVariables(template.body, template.variables), footer: "Template" })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeLessThanOrEqual(4)
    expect(fields.map((f) => `${f.kind}:${f.role}`)).toEqual(template.fields.map((f) => `${f.kind}:${f.role}`))
    for (const f of fields) {
      expect(f.page).toBeLessThanOrEqual(pdf.getPageCount())
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.y).toBeGreaterThanOrEqual(0)
      expect(f.x + f.width).toBeLessThanOrEqual(100)
      expect(f.y + f.height).toBeLessThanOrEqual(100)
      expect(f.width).toBeGreaterThanOrEqual(1)
      expect(f.height).toBeGreaterThanOrEqual(1)
    }
  })
})
