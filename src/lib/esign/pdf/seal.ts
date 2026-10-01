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
import { fitInside, percentToPdfRect } from "./coords"
import { inspectSignatureBytes } from "./signature-image"

export type SealField = {
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
}

const INK = rgb(0.06, 0.09, 0.16)
const MUTED = rgb(0.39, 0.45, 0.55)

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

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; kind: "png" | "jpg" } | null {
  const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUrl)
  if (!match) return null
  return { bytes: new Uint8Array(Buffer.from(match[2], "base64")), kind: match[1] === "png" ? "png" : "jpg" }
}

async function stampFields(doc: PDFDocument, fields: SealField[]) {
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
        const structure = inspectSignatureBytes(image.bytes, image.kind)
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

  await stampFields(doc, input.fields)
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
