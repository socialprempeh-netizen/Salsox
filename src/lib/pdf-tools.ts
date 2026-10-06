/**
 * The engine behind the free PDF tools on the public site (/sign-pdf,
 * /add-signature-to-pdf, /fill-and-sign-pdf, /pdf-signature-generator).
 *
 * Everything here runs in the visitor's browser: the PDF is read, filled,
 * stamped and saved on their device and never uploaded. That is the promise
 * the tool pages make, and it holds because nothing in this file talks to a
 * server. Stamping is the signing engine's own (src/lib/esign/pdf/stamp.ts),
 * so a signature placed here looks exactly like one placed in a document sent
 * for signature.
 *
 * Pure apart from pdf-lib, which is what lets the test beside it build a PDF,
 * run a tool over it and read the result back.
 */
import { PDFCheckBox, PDFDocument, PDFDropdown, PDFRadioGroup, PDFTextField } from "pdf-lib"
import { stampFields, type StampField } from "@/lib/esign/pdf/stamp"

/** Local files can be larger than uploads: nothing crosses the network. */
export const MAX_TOOL_PDF_BYTES = 25 * 1024 * 1024

export type PlacementKind = "signature" | "initials" | "name" | "date" | "text" | "check"

/** A mark placed on a page, in percent of the page from its top-left corner. */
export type Placement = {
  id: string
  kind: PlacementKind
  page: number
  x: number
  y: number
  width: number
  height: number
  /** Text for name, date and text marks. */
  value?: string
  /** A drawn or uploaded signature, as a PNG or JPEG data URL. */
  imageDataUrl?: string
  /** A typed signature. */
  typedText?: string
}

/** Default size of a new mark, in percent of the page. */
export const DEFAULT_PLACEMENT_SIZE: Record<PlacementKind, { width: number; height: number }> = {
  signature: { width: 28, height: 7 },
  initials: { width: 11, height: 5 },
  name: { width: 26, height: 3.5 },
  date: { width: 18, height: 3.5 },
  text: { width: 30, height: 3.5 },
  check: { width: 3.5, height: 2.5 },
}

/** Why a chosen file cannot be used, or null. Checked before anything is read. */
export function toolFileProblem(file: { name: string; type: string; size: number }): "notPdf" | "tooLarge" | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return "notPdf"
  if (file.size > MAX_TOOL_PDF_BYTES) return "tooLarge"
  return null
}

/** "Lease agreement.pdf" becomes "Lease agreement (signed).pdf". */
export function signedFileName(name: string): string {
  const base = name.replace(/\.pdf$/i, "").trim() || "document"
  return `${base} (signed).pdf`
}

/**
 * Turns placements into the stamper's fields. With `everyPage`, each mark on
 * page 1 is repeated at the same position on every page, which is what
 * initialling each page of a contract needs.
 */
export function placementsToStampFields(placements: Placement[], options: { pageCount: number; everyPage?: boolean }): StampField[] {
  const expanded = options.everyPage
    ? placements.flatMap((p) => (p.page === 1 ? Array.from({ length: options.pageCount }, (_, i) => ({ ...p, page: i + 1 })) : [p]))
    : placements
  return expanded
    .filter((p) => p.page >= 1 && p.page <= options.pageCount)
    .map((p): StampField => {
      const base = { page: p.page, x: p.x, y: p.y, width: p.width, height: p.height, inserted: true }
      switch (p.kind) {
        case "signature":
        case "initials":
          return {
            ...base,
            type: p.kind === "signature" ? ("SIGNATURE" as const) : ("INITIALS" as const),
            value: null,
            signature: { imageDataUrl: p.imageDataUrl ?? null, typedText: p.typedText ?? null },
          }
        case "check":
          return { ...base, type: "CHECKBOX" as const, value: "true" }
        case "date":
          return { ...base, type: "DATE" as const, value: p.value ?? null }
        case "name":
          return { ...base, type: "NAME" as const, value: p.value ?? null }
        default:
          return { ...base, type: "TEXT" as const, value: p.value ?? null }
      }
    })
    .filter((f) => f.type === "CHECKBOX" || f.value || f.signature?.imageDataUrl || f.signature?.typedText)
}

export type FormFieldInfo =
  | { name: string; type: "text"; value: string }
  | { name: string; type: "checkbox"; value: boolean }
  | { name: string; type: "choice"; value: string; options: string[] }

/** The fillable fields a PDF already has (an AcroForm), in document order. */
export async function readFormFields(bytes: Uint8Array): Promise<FormFieldInfo[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: false })
  const out: FormFieldInfo[] = []
  for (const field of doc.getForm().getFields()) {
    const name = field.getName()
    if (field instanceof PDFTextField) out.push({ name, type: "text", value: field.getText() ?? "" })
    else if (field instanceof PDFCheckBox) out.push({ name, type: "checkbox", value: field.isChecked() })
    else if (field instanceof PDFDropdown) out.push({ name, type: "choice", value: field.getSelected()[0] ?? "", options: field.getOptions() })
    else if (field instanceof PDFRadioGroup) out.push({ name, type: "choice", value: field.getSelected() ?? "", options: field.getOptions() })
  }
  return out
}

export type FormValues = Record<string, string | boolean>

/**
 * Fills the PDF's own fields, stamps the placed marks, flattens the form so
 * nothing stays editable, and returns the new file. The input is not
 * modified.
 */
export async function buildSignedPdf(
  bytes: Uint8Array,
  placements: Placement[],
  options: { everyPage?: boolean; formValues?: FormValues; title?: string } = {}
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  const form = doc.getForm()
  for (const [name, value] of Object.entries(options.formValues ?? {})) {
    const field = form.getFieldMaybe(name)
    if (!field) continue
    if (field instanceof PDFTextField && typeof value === "string") field.setText(value)
    else if (field instanceof PDFCheckBox) {
      if (value) field.check()
      else field.uncheck()
    }
    else if ((field instanceof PDFDropdown || field instanceof PDFRadioGroup) && typeof value === "string" && value) field.select(value)
  }
  await stampFields(doc, placementsToStampFields(placements, { pageCount: doc.getPageCount(), everyPage: options.everyPage }))
  try {
    form.flatten()
  } catch {
    // A malformed form cannot always be flattened; the stamped marks are
    // still on the page, as in the signing engine's seal.
  }
  if (options.title) doc.setTitle(options.title)
  return doc.save()
}
