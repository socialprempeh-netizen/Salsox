/**
 * Tests for the free PDF tools' engine (pdf-tools.ts): files are checked
 * before reading, marks become the signing engine's fields, a PDF's own form
 * is filled and flattened, and the result opens as a valid PDF.
 */
import { describe, expect, it } from "vitest"
import { PDFDocument, StandardFonts } from "pdf-lib"
import {
  MAX_TOOL_PDF_BYTES,
  buildSignedPdf,
  formTextValue,
  placementsToStampFields,
  readFormFields,
  signedFileName,
  toolFileProblem,
  type Placement,
} from "./pdf-tools"

// 1x1 transparent PNG.
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

async function pdf(pages = 2, withForm = false): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) doc.addPage([600, 800]).drawText(`Page ${i + 1}`, { x: 50, y: 700, font, size: 14 })
  if (withForm) {
    const form = doc.getForm()
    form.createTextField("full_name").addToPage(doc.getPage(0), { x: 50, y: 600, width: 200, height: 20 })
    form.createCheckBox("agree").addToPage(doc.getPage(0), { x: 50, y: 560, width: 12, height: 12 })
    const choice = form.createDropdown("plan")
    choice.addOptions(["Basic", "Pro"])
    choice.addToPage(doc.getPage(0), { x: 50, y: 520, width: 120, height: 20 })
  }
  return doc.save()
}

const mark = (over: Partial<Placement>): Placement => ({ id: "m", kind: "signature", page: 1, x: 10, y: 80, width: 30, height: 7, ...over })

describe("toolFileProblem", () => {
  it("accepts a PDF under the local limit and refuses others", () => {
    expect(toolFileProblem({ name: "a.pdf", type: "application/pdf", size: 1000 })).toBeNull()
    expect(toolFileProblem({ name: "A.PDF", type: "", size: 1000 })).toBeNull()
    expect(toolFileProblem({ name: "a.docx", type: "application/msword", size: 1000 })).toBe("notPdf")
    expect(toolFileProblem({ name: "a.pdf", type: "application/pdf", size: MAX_TOOL_PDF_BYTES + 1 })).toBe("tooLarge")
  })
})

describe("signedFileName", () => {
  it("marks the copy as signed and keeps the name", () => {
    expect(signedFileName("Lease agreement.pdf")).toBe("Lease agreement (signed).pdf")
    expect(signedFileName(".pdf")).toBe("document (signed).pdf")
  })
})

describe("placementsToStampFields", () => {
  it("maps each kind to the engine's field type", () => {
    const fields = placementsToStampFields(
      [
        mark({ kind: "signature", typedText: "Ama Mensah" }),
        mark({ id: "d", kind: "date", value: "2026-10-06" }),
        mark({ id: "c", kind: "check" }),
        mark({ id: "t", kind: "text", value: "Net 30" }),
      ],
      { pageCount: 2 }
    )
    expect(fields.map((f) => f.type)).toEqual(["SIGNATURE", "DATE", "CHECKBOX", "TEXT"])
  })

  it("repeats marks on every page when asked, for initialling", () => {
    const fields = placementsToStampFields([mark({ kind: "initials", typedText: "AM" })], { pageCount: 3, everyPage: true })
    expect(fields.map((f) => f.page)).toEqual([1, 2, 3])
  })

  // It used to repeat only marks placed on page 1, so a signature placed on
  // page 2 with "every page" ticked was stamped once.
  it("repeats a mark placed on any page, not just page 1", () => {
    const fields = placementsToStampFields([mark({ page: 2, typedText: "AM" })], { pageCount: 3, everyPage: true })
    expect(fields.map((f) => f.page)).toEqual([1, 2, 3])
  })

  it("drops empty marks and marks outside the document", () => {
    expect(placementsToStampFields([mark({ kind: "text", value: "" }), mark({ page: 9, typedText: "x" })], { pageCount: 2 })).toEqual([])
  })
})

describe("readFormFields and buildSignedPdf", () => {
  it("lists a PDF's own fields with where each sits on the page", async () => {
    const fields = await readFormFields(await pdf(1, true))
    expect(fields.map((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== "widgets")))).toEqual([
      { name: "full_name", type: "text", value: "", maxLength: undefined },
      { name: "agree", type: "checkbox", value: false },
      { name: "plan", type: "choice", value: "", options: ["Basic", "Pro"] },
    ])
    // full_name was added at x=50, y=600 (from the bottom), 200x20 on a 600x800 page.
    const [box] = fields[0].widgets
    expect(box.page).toBe(1)
    // Within half a percent: pdf-lib pads the rectangle by half the border width.
    expect(box.x).toBeCloseTo((50 / 600) * 100, 0)
    expect(box.y).toBeCloseTo(((800 - 600 - 20) / 800) * 100, 0)
    expect(box.width).toBeCloseTo((200 / 600) * 100, 0)
    expect(box.height).toBeCloseTo((20 / 800) * 100, 0)
  })

  // Each of these used to throw inside pdf-lib and fail the whole download.
  it("fills names and amounts the standard fonts cannot draw, and clips to maxLength", async () => {
    expect(formTextValue("Ọlá Adé")).toBe("Olá Adé")
    expect(formTextValue("₵200")).toBe("GHS 200")
    expect(formTextValue("123456", 4)).toBe("1234")

    const doc = await PDFDocument.create()
    const page = doc.addPage([600, 800])
    const form = doc.getForm()
    form.createTextField("name").addToPage(page, { x: 50, y: 700, width: 200, height: 20 })
    const code = form.createTextField("code")
    code.setMaxLength(4)
    code.addToPage(page, { x: 50, y: 650, width: 80, height: 20 })
    const out = await buildSignedPdf(await doc.save(), [], { formValues: { name: "Ọlá Adé ₵200", code: "123456" } })
    expect((await PDFDocument.load(out)).getForm().getFields()).toHaveLength(0)
  })

  it("fills, stamps and flattens, leaving a valid PDF with no editable fields", async () => {
    const input = await pdf(2, true)
    const out = await buildSignedPdf(input, [mark({ imageDataUrl: PNG }), mark({ id: "d", kind: "date", page: 2, value: "6 Oct 2026" })], {
      formValues: { full_name: "Ama Mensah", agree: true, plan: "Pro" },
      title: "Signed",
    })
    const doc = await PDFDocument.load(out)
    expect(doc.getPageCount()).toBe(2)
    expect(doc.getTitle()).toBe("Signed")
    expect(doc.getForm().getFields()).toHaveLength(0)
    expect(out.length).toBeGreaterThan(input.length)
  })

  it("does not modify the input bytes", async () => {
    const input = await pdf(1)
    const copy = input.slice()
    await buildSignedPdf(input, [mark({ typedText: "Ama" })])
    expect(input).toEqual(copy)
  })
})
