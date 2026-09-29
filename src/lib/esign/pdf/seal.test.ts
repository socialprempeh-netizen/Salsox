import { describe, expect, it } from "vitest"
import { PDFDocument } from "pdf-lib"
import { sealDocument, toWinAnsi } from "./seal"
import { inspectPdf } from "./inspect"

// 1x1 transparent PNG.
const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="

async function samplePdf(pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([600, 800]).drawText(`Page ${i + 1}`, { x: 50, y: 700 })
  return doc.save()
}

const base = {
  documentId: "doc_1",
  title: "Service agreement",
  originalSha256: "abc",
  appName: "Salsox",
  recipients: [{ name: "Ama", email: "ama@example.com", role: "SIGNER", signedAt: new Date(), status: "SIGNED" }],
  audit: [{ createdAt: new Date(), type: "DOCUMENT_SENT", actorEmail: "owner@example.com", ipAddress: "127.0.0.1" }],
  completedAt: new Date("2026-09-29T12:00:00Z"),
}

describe("inspectPdf", () => {
  it("accepts a valid PDF and counts pages", async () => {
    expect(await inspectPdf(await samplePdf(3))).toEqual({ ok: true, pageCount: 3 })
  })
  it("rejects non-PDF bytes", async () => {
    expect(await inspectPdf(new TextEncoder().encode("hello"))).toEqual({ ok: false, reason: "NOT_PDF" })
  })
})

describe("sealDocument", () => {
  it("stamps fields and appends a certificate page", async () => {
    const sealed = await sealDocument({
      ...base,
      original: await samplePdf(2),
      fields: [
        { type: "SIGNATURE", page: 2, x: 10, y: 80, width: 40, height: 8, value: null, inserted: true, signature: { imageDataUrl: PNG, typedText: null } },
        { type: "SIGNATURE", page: 1, x: 10, y: 80, width: 40, height: 8, value: null, inserted: true, signature: { imageDataUrl: null, typedText: "Ama Mensah" } },
        { type: "DATE", page: 2, x: 60, y: 80, width: 20, height: 8, value: "2026-09-29", inserted: true },
        { type: "CHECKBOX", page: 1, x: 5, y: 5, width: 3, height: 3, value: "true", inserted: true },
      ],
    })
    const out = await PDFDocument.load(sealed)
    expect(out.getPageCount()).toBe(3)
    expect(out.getTitle()).toBe("Service agreement")
  })

  it("adds the appended signature page Quick Send may reference", async () => {
    const sealed = await sealDocument({
      ...base,
      original: await samplePdf(1),
      fields: [{ type: "DATE", page: 2, x: 10, y: 10, width: 20, height: 5, value: "x", inserted: true }],
    })
    expect((await PDFDocument.load(sealed)).getPageCount()).toBe(3)
  })

  it("applies a digital signature when a P12 certificate is configured", async () => {
    // A throwaway self-signed certificate, generated per run: no key material
    // lives in the repository.
    const forge = (await import("node-forge")).default
    const keys = forge.pki.rsa.generateKeyPair(2048)
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = "01"
    cert.validity.notBefore = new Date(Date.now() - 86_400_000)
    cert.validity.notAfter = new Date(Date.now() + 86_400_000)
    const attrs = [{ name: "commonName", value: "Salsox Test Seal" }]
    cert.setSubject(attrs)
    cert.setIssuer(attrs)
    cert.sign(keys.privateKey, forge.md.sha256.create())
    const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], "secret", { algorithm: "3des" })
    const certificate = new Uint8Array(Buffer.from(forge.asn1.toDer(p12).getBytes(), "binary"))

    const sealed = await sealDocument({
      ...base,
      original: await samplePdf(1),
      fields: [],
      p12: { certificate, passphrase: "secret" },
    })
    const text = Buffer.from(sealed).toString("latin1")
    expect(text).toContain("/ByteRange")
    expect(text).toContain("/adbe.pkcs7.detached")
  }, 30_000)

  it("survives characters outside WinAnsi", () => {
    expect(toWinAnsi("Ọlá 😀 Kofi")).toBe("?lá ?? Kofi")
  })
})
