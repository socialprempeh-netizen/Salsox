/**
 * Tests for signature image validation.
 *
 * The images are built here, byte by byte, so the file needs no fixtures and
 * each broken case is broken in exactly one known way.
 *
 * Two of the broken cases (a PNG cut short, a PNG with damaged pixel data)
 * make pdf-lib loop forever if it is given them. That is the reason the
 * validator inspects the structure itself first, and it is why a regression
 * here shows up as a test run that never finishes, not as a failed assertion.
 *
 * The last block ties the validator to the sealer: what the validator
 * accepts seals, and what it refuses stops the sealer with an error.
 */
import { deflateSync, crc32 } from "node:zlib"
import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import { checkSignatureImage, inspectSignatureBytes, MAX_SIGNATURE_BYTES, MAX_SIGNATURE_SIDE } from "./signature-image"
import { sealDocument } from "./seal"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** One PNG chunk, with a correct length and checksum. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, "latin1"), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, checksum])
}

function ihdr(width: number, height: number, interlace = 0): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 6, 0, 0, interlace], 8) // 8 bits, RGBA
  return chunk("IHDR", header)
}

/** Transparent RGBA rows: a filter byte then four bytes per pixel. */
function pixelData(width: number, height: number): Buffer {
  return deflateSync(Buffer.alloc(height * (1 + width * 4)))
}

/**
 * A PNG assembled from parts. With only a size it is a real, decodable image;
 * the options replace one part so a test can break exactly that.
 */
function png(width: number, height: number, parts: { idat?: Buffer; interlace?: number; end?: boolean } = {}): Buffer {
  return Buffer.concat([
    PNG_SIGNATURE,
    ihdr(width, height, parts.interlace),
    chunk("IDAT", parts.idat ?? pixelData(width, height)),
    ...(parts.end === false ? [] : [chunk("IEND", Buffer.alloc(0))]),
  ])
}

// A 1x1 baseline JPEG.
const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=",
  "base64"
)

const url = (bytes: Buffer, type = "png") => `data:image/${type};base64,${bytes.toString("base64")}`
const unreadable = { ok: false, reason: "UNREADABLE" }

describe("checkSignatureImage", () => {
  it("accepts a real PNG and reports its size", async () => {
    expect(await checkSignatureImage(url(png(300, 100)))).toEqual({ ok: true, kind: "png", width: 300, height: 100 })
  })

  it("accepts a real JPEG", async () => {
    expect(await checkSignatureImage(url(JPEG, "jpeg"))).toEqual({ ok: true, kind: "jpg", width: 1, height: 1 })
  })

  it("rejects bytes that are not an image, however well-formed the data URL", async () => {
    const notAnImage = Buffer.from("this is base64 of plain text, not a picture")
    expect(await checkSignatureImage(url(notAnImage))).toEqual({ ok: false, reason: "NOT_AN_IMAGE" })
  })

  it("rejects a PNG cut off part-way through", async () => {
    const whole = png(300, 100)
    for (const keep of [20, 40, 60, whole.length - 20, whole.length - 1]) {
      expect(await checkSignatureImage(url(whole.subarray(0, keep)))).toEqual(unreadable)
    }
  })

  it("rejects a PNG with no end marker", async () => {
    expect(await checkSignatureImage(url(png(10, 10, { end: false })))).toEqual(unreadable)
  })

  it("rejects a PNG whose pixel data is not compressed data at all", async () => {
    const broken = png(10, 10, { idat: Buffer.from("not deflate data at all") })
    expect(await checkSignatureImage(url(broken))).toEqual(unreadable)
  })

  it("rejects a PNG whose pixel data is the wrong amount for its size", async () => {
    expect(await checkSignatureImage(url(png(10, 10, { idat: pixelData(10, 4) })))).toEqual(unreadable)
    expect(await checkSignatureImage(url(png(10, 10, { idat: pixelData(10, 40) })))).toEqual(unreadable)
  })

  it("rejects a PNG with a byte changed, by its checksum", async () => {
    const flipped = Buffer.from(png(10, 10))
    flipped[45] ^= 0xff // inside the pixel data chunk
    expect(await checkSignatureImage(url(flipped))).toEqual(unreadable)
  })

  it("rejects an interlaced PNG, which no browser canvas produces", async () => {
    expect(await checkSignatureImage(url(png(10, 10, { interlace: 1 })))).toEqual(unreadable)
  })

  it("rejects an image declared as the other type", async () => {
    expect(await checkSignatureImage(url(png(10, 10), "jpeg"))).toEqual({ ok: false, reason: "WRONG_TYPE" })
    expect(await checkSignatureImage(url(JPEG, "png"))).toEqual({ ok: false, reason: "WRONG_TYPE" })
  })

  it("rejects a header that claims enormous dimensions, without inflating anything", async () => {
    // A valid file in every other respect: tiny data, huge declared size.
    const bomb = png(30_000, 30_000, { idat: pixelData(1, 1) })
    expect(await checkSignatureImage(url(bomb))).toEqual({ ok: false, reason: "TOO_LARGE" })
    const wide = png(MAX_SIGNATURE_SIDE + 1, 1, { idat: pixelData(1, 1) })
    expect(await checkSignatureImage(url(wide))).toEqual({ ok: false, reason: "TOO_LARGE" })
  })

  it("rejects a zero-sized image", async () => {
    expect(await checkSignatureImage(url(png(0, 10, { idat: pixelData(1, 1) })))).toEqual(unreadable)
  })

  it("rejects more data than a signature needs", async () => {
    const padded = Buffer.concat([png(10, 10), Buffer.alloc(MAX_SIGNATURE_BYTES)])
    expect(await checkSignatureImage(url(padded))).toEqual({ ok: false, reason: "TOO_LARGE" })
  })

  it("rejects a JPEG cut off part-way through", async () => {
    expect(await checkSignatureImage(url(JPEG.subarray(0, 40), "jpeg"))).toEqual(unreadable)
    expect(await checkSignatureImage(url(JPEG.subarray(0, JPEG.length - 2), "jpeg"))).toEqual(unreadable)
  })

  it("rejects anything that is not an image data URL", async () => {
    for (const bad of ["", "hello", "data:image/png;base64,", "data:image/svg+xml;base64,PHN2Zy8+", "data:text/html;base64,PGI+"]) {
      expect(await checkSignatureImage(bad)).toEqual({ ok: false, reason: "NOT_AN_IMAGE" })
    }
  })
})

describe("inspectSignatureBytes", () => {
  it("gives the same verdict without touching pdf-lib", () => {
    expect(inspectSignatureBytes(png(300, 100), "png")).toEqual({ ok: true, kind: "png", width: 300, height: 100 })
    expect(inspectSignatureBytes(png(300, 100).subarray(0, 60), "png")).toEqual(unreadable)
  })
})

describe("the validator and the sealer agree", () => {
  const seal = async (imageDataUrl: string) => {
    const original = await PDFDocument.create()
    original.addPage([600, 800])
    return sealDocument({
      original: await original.save(),
      documentId: "doc_1",
      title: "Service agreement",
      originalSha256: "abc",
      appName: "Salsox",
      recipients: [{ name: "Ama", email: "ama@example.com", role: "SIGNER", signedAt: new Date(), status: "SIGNED" }],
      audit: [],
      completedAt: new Date("2026-09-30T12:00:00Z"),
      fields: [
        { type: "SIGNATURE", page: 1, x: 10, y: 10, width: 30, height: 10, value: null, inserted: true, signature: { imageDataUrl, typedText: null } },
      ],
    })
  }

  it("a signature the validator accepts seals", async () => {
    const good = url(png(300, 100))
    expect((await checkSignatureImage(good)).ok).toBe(true)
    const sealed = await seal(good)
    expect((await PDFDocument.load(sealed)).getPageCount()).toBe(2) // the page + the certificate
  })

  it("a corrupt signature that reached storage anyway stops the seal with an error, and does not hang it", async () => {
    const corrupt = [
      url(Buffer.from("this is base64 of plain text, not a picture")),
      url(png(300, 100).subarray(0, 60)),
      url(png(10, 10, { idat: Buffer.from("not deflate data at all") })),
    ]
    for (const image of corrupt) {
      expect((await checkSignatureImage(image)).ok).toBe(false)
      await expect(seal(image)).rejects.toThrow(/cannot be stamped/)
    }
  })
})
