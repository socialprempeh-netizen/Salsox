/**
 * Produces the final, signed PDF.
 *
 * Steps, in order:
 *   1. Load the untouched original.
 *   2. Append a blank page if Quick Send placed the signature block on its
 *      own page (fields referencing pageCount + 1).
 *   3. Stamp every inserted field (signature images, typed signatures, text,
 *      dates, checkboxes) at its stored position.
 *   4. Flatten any AcroForm so nothing stays editable.
 *   5. Append the certificate of completion: document hash, recipients, and
 *      the full audit trail.
 *   6. If a P12 certificate is configured, apply a digital signature over the
 *      whole file so any later modification is detectable in PDF readers.
 *
 * Pure with respect to storage and database: it takes plain data and returns
 * bytes, which is what makes it testable against a generated PDF.
 */
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { stampFields, toWinAnsi, INK, type StampField } from "./stamp"
import { inspectSignatureBytes } from "./signature-image"
import { encode } from "uqr"

export { toWinAnsi }

// The field shape and the stamper moved to ./stamp (shared with the free
// PDF tools, which stamp in the browser); re-exported under the old names.
export type SealField = StampField

export type SealRecipient = {
  name: string
  email: string
  role: string
  signedAt: Date | null
  status: string
}

export type SealAuditEvent = {
  createdAt: Date
  type: string
  actorEmail: string | null
  ipAddress: string | null
}

export type SealInput = {
  original: Uint8Array
  documentId: string
  title: string
  originalSha256: string
  appName: string
  fields: SealField[]
  recipients: SealRecipient[]
  audit: SealAuditEvent[]
  completedAt: Date
  /** Adds a large "REJECTED" stamp to every page instead of completing it. */
  rejected?: boolean
  /**
   * Append the certificate page (steps 5 and 6). On by default; off for an
   * owner whose plan does not include it (see plans.ts), in which case no
   * digital signature is applied either, whatever `p12` says.
   */
  certificate?: boolean
  p12?: { certificate: Uint8Array; passphrase: string } | null
  /**
   * The public verification code and its link (src/lib/esign/verify.ts),
   * printed on the certificate with a QR code. Absent on documents sealed
   * before codes existed, which verify by their document ID.
   */
  verification?: { code: string; url: string } | null
}

const MUTED = rgb(0.39, 0.45, 0.55)

function stampRejected(doc: PDFDocument, font: PDFFont) {
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    page.drawText("REJECTED", {
      x: width * 0.18,
      y: height * 0.45,
      size: Math.min(width, height) / 7,
      font,
      color: rgb(0.8, 0.1, 0.1),
      opacity: 0.35,
    })
  }
}

/** Appends one or more certificate pages; returns nothing, mutates `doc`. */
async function appendCertificate(doc: PDFDocument, input: SealInput) {
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const [W, H] = [595.28, 841.89] // A4
  const margin = 48
  let page = doc.addPage([W, H])
  let y = H - margin

  const line = (text: string, opts: { font?: PDFFont; size?: number; color?: typeof INK; gap?: number } = {}) => {
    const size = opts.size ?? 9
    if (y < margin + size) {
      page = doc.addPage([W, H])
      y = H - margin
    }
    page.drawText(toWinAnsi(text).slice(0, 140), { x: margin, y, size, font: opts.font ?? regular, color: opts.color ?? INK })
    y -= size + (opts.gap ?? 5)
  }

  line(`Certificate of ${input.rejected ? "rejection" : "completion"}`, { font: bold, size: 18, gap: 10 })
  line(`${input.appName} - electronic signature record`, { color: MUTED, gap: 14 })
  line(`Document: ${input.title}`, { font: bold, size: 11 })
  line(`Document ID: ${input.documentId}`)
  line(`Original SHA-256: ${input.originalSha256}`)
  line(`${input.rejected ? "Closed" : "Completed"}: ${input.completedAt.toISOString()}`, { gap: 14 })

  if (input.verification) {
    // Its own block rather than a corner of the heading, which a long title
    // would run into: a QR a phone can be pointed at, and the code and link
    // beside it for anyone typing them.
    const qr = 72
    const top = y + 9
    drawQrCode(page, input.verification.url, { x: margin, y: top - qr, size: qr })
    const textX = margin + qr + 14
    const beside = (text: string, dy: number, font: PDFFont, size: number, color = INK) =>
      page.drawText(toWinAnsi(text).slice(0, 90), { x: textX, y: top - dy, size, font, color })
    beside("Verify this document", 14, bold, 11)
    beside(`Verification code: ${input.verification.code}`, 32, bold, 10)
    beside(input.verification.url, 48, regular, 8, MUTED)
    beside("Shows who signed and when. The content of the document is never shown.", 62, regular, 8, MUTED)
    y = top - qr - 16
  }

  line("Recipients", { font: bold, size: 12, gap: 8 })
  for (const r of input.recipients) {
    line(`${r.name} <${r.email}> - ${r.role}`, { font: bold })
    line(`Status: ${r.status}${r.signedAt ? `, signed ${r.signedAt.toISOString()}` : ""}`, { color: MUTED, gap: 8 })
  }

  y -= 6
  line("Audit trail (UTC)", { font: bold, size: 12, gap: 8 })
  for (const e of input.audit) {
    const who = e.actorEmail ? ` by ${e.actorEmail}` : ""
    const ip = e.ipAddress ? ` from ${e.ipAddress}` : ""
    line(`${e.createdAt.toISOString()}  ${e.type}${who}${ip}`, { size: 8, gap: 4 })
  }
}

/**
 * Draws a QR code as vector squares, so it stays sharp at any print size and
 * needs no image encoder. Dark modules only, on a white square with the quiet
 * zone the encoder adds around it.
 */
function drawQrCode(page: PDFPage, text: string, box: { x: number; y: number; size: number }) {
  const { data, size } = encode(text, { ecc: "M" })
  const cell = box.size / size
  page.drawRectangle({ x: box.x, y: box.y, width: box.size, height: box.size, color: rgb(1, 1, 1) })
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (!data[row][col]) continue
      page.drawRectangle({ x: box.x + col * cell, y: box.y + box.size - (row + 1) * cell, width: cell, height: cell, color: INK })
    }
  }
}

async function applyDigitalSignature(doc: PDFDocument, input: SealInput): Promise<Uint8Array> {
  const [{ pdflibAddPlaceholder }, { P12Signer }, signpdfModule] = await Promise.all([
    import("@signpdf/placeholder-pdf-lib"),
    import("@signpdf/signer-p12"),
    import("@signpdf/signpdf"),
  ])
  pdflibAddPlaceholder({
    pdfDoc: doc,
    reason: "Electronically signed and sealed",
    contactInfo: "",
    name: input.appName,
    location: "",
    appName: input.appName,
  })
  const withPlaceholder = await doc.save({ useObjectStreams: false })
  const signer = new P12Signer(Buffer.from(input.p12!.certificate), { passphrase: input.p12!.passphrase })
  const signed = await signpdfModule.default.sign(Buffer.from(withPlaceholder), signer)
  return new Uint8Array(signed)
}

export async function sealDocument(input: SealInput): Promise<Uint8Array> {
  const doc = await PDFDocument.load(input.original, { updateMetadata: false })

  // Quick Send with many signers puts the signature block on an extra page.
  const lastFieldPage = Math.max(0, ...input.fields.map((f) => f.page))
  while (doc.getPageCount() < lastFieldPage) {
    const last = doc.getPage(doc.getPageCount() - 1).getSize()
    doc.addPage([last.width, last.height])
  }

  await stampFields(doc, input.fields, inspectSignatureBytes)
  try {
    doc.getForm().flatten()
  } catch {
    // Malformed forms cannot always be flattened; the stamped content is still
    // on the page, so the seal proceeds rather than failing the document.
  }
  if (input.rejected) stampRejected(doc, await doc.embedFont(StandardFonts.HelveticaBold))
  const withCertificate = input.certificate !== false
  if (withCertificate) await appendCertificate(doc, input)

  doc.setTitle(input.title)
  doc.setProducer(input.appName)
  doc.setModificationDate(input.completedAt)

  if (withCertificate && input.p12) return applyDigitalSignature(doc, input)
  return doc.save()
}
