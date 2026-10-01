/**
 * Upload validation for PDFs.
 *
 * Runs on the server before anything is stored: checks the magic bytes, that
 * pdf-lib can parse the file, that it is not encrypted (we could not stamp
 * signatures into it), and returns the page count the editor and Quick Send
 * need.
 */
import { PDFDocument } from "pdf-lib"
import { MAX_PDF_BYTES } from "../limits"

// Moved to src/lib/esign/limits.ts, which the upload dropzone reads too:
// the two copies were kept equal only by a comment. Re-exported so existing
// imports keep working.
// /**
//  * 4 MB: under Vercel's 4.5 MB request-body limit for functions, which is what
//  * an upload through a server action is subject to. Larger files need a direct
//  * client upload to Blob, which is a later addition.
//  */
// export const MAX_PDF_BYTES = 4 * 1024 * 1024
export { MAX_PDF_BYTES }

export type PdfInspection =
  | { ok: true; pageCount: number }
  | { ok: false; reason: "NOT_PDF" | "TOO_LARGE" | "ENCRYPTED" | "UNREADABLE" | "EMPTY" }

export async function inspectPdf(bytes: Uint8Array): Promise<PdfInspection> {
  if (bytes.byteLength > MAX_PDF_BYTES) return { ok: false, reason: "TOO_LARGE" }
  // "%PDF-" may be preceded by a little junk in real-world files; the spec
  // allows it within the first 1024 bytes.
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1")
  if (!head.includes("%PDF-")) return { ok: false, reason: "NOT_PDF" }
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    if (doc.isEncrypted) return { ok: false, reason: "ENCRYPTED" }
    const pageCount = doc.getPageCount()
    if (pageCount === 0) return { ok: false, reason: "EMPTY" }
    return { ok: true, pageCount }
  } catch {
    return { ok: false, reason: "UNREADABLE" }
  }
}
