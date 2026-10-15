/**
 * The parts of the free PDF tools' engine (src/lib/pdf-tools.ts) that do not
 * need pdf-lib: limits, placement types and sizes, file checks and names.
 *
 * Why this exists: the tool page imported these few constants from
 * pdf-tools.ts, and that file imports pdf-lib at the top, so pdf-lib and its
 * font engine (about 175 KB compressed) shipped with the page before anyone
 * chose a file, defeating the `await import("@/lib/pdf-tools")` that was meant
 * to load it only when needed. The page imports from here instead; pdf-tools.ts
 * re-exports everything, so nothing else changes.
 */

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

/** Where a form field sits: its page (1-based) and box, in percent from the top-left, like placements. */
export type FieldWidget = { page: number; x: number; y: number; width: number; height: number }

export type FormFieldInfo =
  | { name: string; type: "text"; value: string; maxLength?: number; widgets: FieldWidget[] }
  | { name: string; type: "checkbox"; value: boolean; widgets: FieldWidget[] }
  | { name: string; type: "choice"; value: string; options: string[]; widgets: FieldWidget[] }

export type FormValues = Record<string, string | boolean>
