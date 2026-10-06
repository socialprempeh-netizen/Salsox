/**
 * Stamping filled fields onto PDF pages: signatures (drawn, uploaded or
 * typed), text, dates and checkmarks, each at its position in page percent.
 *
 * Moved out of seal.ts so the same code runs in two places: the signing
 * engine, which stamps before sealing, and the free PDF tools on the public
 * site, which stamp in the visitor's browser so the file is never uploaded
 * (src/components/tools). One stamper means a signature looks the same
 * whichever path produced it. Browser-safe: no Node APIs (it used
 * `Buffer` to decode images, which a browser does not have).
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { fitInside, percentToPdfRect } from "./coords"
import type { SignatureImageCheck, SignatureImageKind } from "./signature-image"

export type StampField = {
  type: "SIGNATURE" | "INITIALS" | "NAME" | "EMAIL" | "DATE" | "TEXT" | "CHECKBOX"
  page: number
  x: number
  y: number
  width: number
  height: number
  value: string | null
  inserted: boolean
  signature?: { imageDataUrl: string | null; typedText: string | null } | null
}

export const INK = rgb(0.06, 0.09, 0.16)

/**
 * The standard 14 fonts only encode WinAnsi. A name like "Kwame Nkrumah" is
 * fine; characters outside that set would make pdf-lib throw mid-seal, so they
 * are replaced rather than allowed to fail the whole document.
 */
export function toWinAnsi(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?")
}

function fitFontSize(font: PDFFont, text: string, maxWidth: number, maxHeight: number): number {
  let size = Math.min(maxHeight * 0.7, 28)
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.5
  return size
}

function drawFittedText(page: PDFPage, text: string, box: { x: number; y: number; width: number; height: number }, font: PDFFont) {
  const safe = toWinAnsi(text)
  const size = fitFontSize(font, safe, box.width - 4, box.height)
  page.drawText(safe, {
    x: box.x + 2,
    y: box.y + (box.height - size) / 2 + size * 0.2,
    size,
    font,
    color: INK,
  })
}

/** Base64 to bytes without Buffer, so this file also runs in a browser. */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; kind: "png" | "jpg" } | null {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { bytes: base64ToBytes(match[2]), kind: match[1] === "png" ? "png" : "jpg" }
}

/**
 * `inspect` is the structural image check (inspectSignatureBytes in
 * signature-image.ts). The seal passes it: its images came from a database
 * and pdf-lib loops forever on a damaged PNG. It is a parameter because that
 * check needs node:zlib; the browser tools stamp images they have just
 * re-encoded through a canvas, which are whole by construction.
 */
export async function stampFields(
  doc: PDFDocument,
  fields: StampField[],
  inspect?: (bytes: Uint8Array, kind: SignatureImageKind) => SignatureImageCheck
) {
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const script = await doc.embedFont(StandardFonts.TimesRomanItalic)
  const pages = doc.getPages()

  for (const field of fields) {
    if (!field.inserted) continue
    const page = pages[field.page - 1]
    if (!page) continue
    const { width, height } = page.getSize()
    const box = percentToPdfRect(field, width, height)

    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      const image = field.signature?.imageDataUrl ? dataUrlToBytes(field.signature.imageDataUrl) : null
      if (image) {
        // Signatures are validated when they are submitted, so this should
        // never fire. It is here because pdf-lib does not fail on a damaged
        // PNG, it loops forever: an image that reached the database some
        // other way must stop the seal with an error that says why, not hang
        // the request until the platform kills it.
        const structure = inspect?.(image.bytes, image.kind) ?? { ok: true as const }
        if (!structure.ok) throw new Error(`Signature image cannot be stamped (${structure.reason})`)
        const embedded = image.kind === "png" ? await doc.embedPng(image.bytes) : await doc.embedJpg(image.bytes)
        page.drawImage(embedded, fitInside(embedded.width, embedded.height, box))
      } else if (field.signature?.typedText) {
        drawFittedText(page, field.signature.typedText, box, script)
      }
      continue
    }

    if (field.type === "CHECKBOX") {
      if (field.value === "true") drawFittedText(page, "X", box, regular)
      continue
    }

    if (field.value) drawFittedText(page, field.value, box, regular)
  }
}

