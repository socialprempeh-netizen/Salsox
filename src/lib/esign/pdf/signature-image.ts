/**
 * Validation for drawn or uploaded signature images, run when a signer
 * submits one and before anything is stored.
 *
 * Why it exists: a signature arrives as a data URL and used to be checked
 * only for its shape (the right prefix, base64 characters, a size cap). Bytes
 * that were not a usable image passed, were stored as the signature, and
 * nothing objected until the last signer finished and the document was
 * sealed. There pdf-lib either threw (bytes that are not an image at all) or,
 * worse, never returned: given a PNG that is cut short or whose pixel data is
 * damaged, its decoder loops forever. Either way the document could not be
 * sealed, on any retry: one bad submission, from one signer, blocked it for
 * everyone and for good. Rejecting it here turns that into a message the
 * signer sees while the signature pad is still open, and can fix by drawing
 * again.
 *
 * Because of that endless loop, pdf-lib cannot be the validator. A loop that
 * never yields cannot be timed out, so a bad image has to be recognised
 * WITHOUT handing it to pdf-lib. The checks, cheapest first:
 *
 *   1. The bytes start like the type they claim to be. The sealer picks its
 *      decoder from the declared type, so a JPEG labelled PNG fails there too.
 *   2. The structure is whole (`inspectSignatureBytes`). For a PNG: every
 *      chunk present with a matching checksum, a sane header, and pixel data
 *      that really inflates to exactly the size the header promises. Node's
 *      own zlib does the inflating, which fails cleanly on damage. The
 *      dimensions are checked before anything is inflated, because a few
 *      hundred kilobytes of PNG can declare tens of thousands of pixels a
 *      side and cost gigabytes to decode.
 *   3. Only then, pdf-lib embeds it into a throwaway PDF and saves. Those are
 *      the calls the sealer makes (src/lib/esign/pdf/seal.ts), so what passes
 *      here is what sealing can stamp.
 *
 * The sealer runs step 2 again before it embeds a stored image, so an image
 * that reached the database some other way fails with an error instead of
 * hanging the seal.
 *
 * Pure with respect to storage and database: bytes in, a verdict out.
 */
import { crc32, inflateSync } from "node:zlib"
import { PDFDocument } from "pdf-lib"

/** Decoded size of the image data. A drawn signature is a few tens of KB. */
export const MAX_SIGNATURE_BYTES = 300_000
/** Longest side, in pixels. The signing pad produces well under 2,000. */
export const MAX_SIGNATURE_SIDE = 4096
/** Total pixels. Bounds the memory a decode can take. */
export const MAX_SIGNATURE_PIXELS = 4_000_000

export type SignatureImageKind = "png" | "jpg"
export type SignatureImageProblem = "NOT_AN_IMAGE" | "WRONG_TYPE" | "TOO_LARGE" | "UNREADABLE"

export type SignatureImageCheck =
  | { ok: true; kind: SignatureImageKind; width: number; height: number }
  | { ok: false; reason: SignatureImageProblem }

const DATA_URL = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]+={0,2})$/
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const JPEG_START = [0xff, 0xd8, 0xff]

const fail = (reason: SignatureImageProblem): SignatureImageCheck => ({ ok: false, reason })

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, i) => bytes[i] === byte)
}

function tooLarge(width: number, height: number): boolean {
  return width > MAX_SIGNATURE_SIDE || height > MAX_SIGNATURE_SIDE || width * height > MAX_SIGNATURE_PIXELS
}

/** Samples per pixel for each PNG colour type, and the bit depths it allows. */
const PNG_COLOUR: Record<number, { channels: number; depths: number[] }> = {
  0: { channels: 1, depths: [1, 2, 4, 8, 16] }, // greyscale
  2: { channels: 3, depths: [8, 16] }, // RGB
  3: { channels: 1, depths: [1, 2, 4, 8] }, // palette
  4: { channels: 2, depths: [8, 16] }, // greyscale + alpha
  6: { channels: 4, depths: [8, 16] }, // RGBA
}

/**
 * Walks a PNG from the first chunk to IEND and proves it is whole: checksums,
 * header, and pixel data that inflates to exactly what the header describes.
 */
function inspectPng(bytes: Uint8Array): SignatureImageCheck {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = PNG_SIGNATURE.length
  let header: { width: number; height: number; depth: number; colour: number } | null = null
  let hasPalette = false
  let ended = false
  const data: Uint8Array[] = []

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset)
    const end = offset + 12 + length
    // A chunk that claims to run past the end of the file: cut short.
    if (end > bytes.length) return fail("UNREADABLE")
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7])
    const body = bytes.subarray(offset + 8, offset + 8 + length)
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)) return fail("UNREADABLE")

    if (!header) {
      // IHDR is always first and always 13 bytes.
      if (type !== "IHDR" || length !== 13) return fail("UNREADABLE")
      header = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12), depth: body[8], colour: body[9] }
      if (header.width < 1 || header.height < 1) return fail("UNREADABLE")
      // Before any pixel data is looked at, let alone inflated.
      if (tooLarge(header.width, header.height)) return fail("TOO_LARGE")
      const colour = PNG_COLOUR[header.colour]
      if (!colour || !colour.depths.includes(header.depth)) return fail("UNREADABLE")
      // Compression and filter methods have one legal value each. Interlaced
      // images are refused: a browser canvas never produces one, and they are
      // the part of the format decoders most often get wrong.
      if (body[10] !== 0 || body[11] !== 0 || body[12] !== 0) return fail("UNREADABLE")
    } else if (type === "PLTE") {
      hasPalette = true
    } else if (type === "IDAT") {
      data.push(body)
    } else if (type === "IEND") {
      ended = true
      break
    }
    offset = end
  }

  if (!header || !ended || data.length === 0) return fail("UNREADABLE")
  if (header.colour === 3 && !hasPalette) return fail("UNREADABLE")

  // Every row is one filter byte followed by the row's samples.
  const rowBytes = Math.ceil((header.width * PNG_COLOUR[header.colour].channels * header.depth) / 8)
  const expected = header.height * (rowBytes + 1)
  let pixels: Uint8Array
  try {
    // One byte over, so that "too much data" shows up as a length mismatch
    // and not as an error that looks the same as damage.
    pixels = inflateSync(Buffer.concat(data), { maxOutputLength: expected + 1 })
  } catch {
    return fail("UNREADABLE")
  }
  if (pixels.length !== expected) return fail("UNREADABLE")
  for (let row = 0; row < header.height; row++) {
    if (pixels[row * (rowBytes + 1)] > 4) return fail("UNREADABLE") // filter types are 0 to 4
  }

  return { ok: true, kind: "png", width: header.width, height: header.height }
}

/**
 * Finds a JPEG's frame header by walking its segment markers, and requires
 * the file to end where a JPEG ends. pdf-lib does not decode JPEG pixels (the
 * PDF reader does), so what it needs, and what is checked, is the framing.
 */
function inspectJpeg(bytes: Uint8Array): SignatureImageCheck {
  if (bytes.length < 4 || bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return fail("UNREADABLE")
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 2 // past the start-of-image marker
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return fail("UNREADABLE")
    const marker = bytes[offset + 1]
    // Padding, and markers that carry no length.
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      offset += 2
      continue
    }
    const length = view.getUint16(offset + 2)
    if (length < 2) return fail("UNREADABLE")
    // SOF0 to SOF15, except DHT (C4), JPG (C8) and DAC (CC), which share the range.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isFrame) {
      const height = view.getUint16(offset + 5)
      const width = view.getUint16(offset + 7)
      if (width < 1 || height < 1) return fail("UNREADABLE")
      if (tooLarge(width, height)) return fail("TOO_LARGE")
      return { ok: true, kind: "jpg", width, height }
    }
    offset += 2 + length
  }
  return fail("UNREADABLE")
}

/**
 * Structural check of raw image bytes against the type they are declared as.
 * Synchronous, bounded, and never calls pdf-lib: safe on any input. Used
 * here, and by the sealer before it embeds a stored image.
 */
export function inspectSignatureBytes(bytes: Uint8Array, kind: SignatureImageKind): SignatureImageCheck {
  if (bytes.length === 0) return fail("NOT_AN_IMAGE")
  if (bytes.length > MAX_SIGNATURE_BYTES) return fail("TOO_LARGE")
  const looksPng = startsWith(bytes, PNG_SIGNATURE)
  const looksJpg = startsWith(bytes, JPEG_START)
  if (!looksPng && !looksJpg) return fail("NOT_AN_IMAGE")
  if ((kind === "png") !== looksPng) return fail("WRONG_TYPE")
  return kind === "png" ? inspectPng(bytes) : inspectJpeg(bytes)
}

/**
 * Checks a signature data URL, start to finish. Never throws and never
 * hangs: every way of being wrong comes back as `{ ok: false, reason }`.
 */
export async function checkSignatureImage(dataUrl: string): Promise<SignatureImageCheck> {
  const match = DATA_URL.exec(dataUrl)
  if (!match) return fail("NOT_AN_IMAGE")
  const kind: SignatureImageKind = match[1] === "png" ? "png" : "jpg"
  const bytes = new Uint8Array(Buffer.from(match[2], "base64"))

  const structure = inspectSignatureBytes(bytes, kind)
  if (!structure.ok) return structure

  // The structure is sound, so pdf-lib can be trusted with it. This last step
  // confirms the sealer's own calls succeed on this exact image.
  try {
    const doc = await PDFDocument.create()
    const image = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes)
    doc.addPage([200, 100]).drawImage(image, { x: 0, y: 0, width: 200, height: 100 })
    await doc.save()
    return { ok: true, kind, width: image.width, height: image.height }
  } catch {
    return fail("UNREADABLE")
  }
}
