/**
 * Tests for GET /sign/{token}/file, the route that hands a recipient the
 * original PDF.
 *
 * A signing link outlives the document's useful life: it sits in inboxes and
 * chat threads after the sender cancels, a signer declines, or the link runs
 * out. These tests pin down that the route only serves the file while the
 * document is live or finished, and answers everything else with the same 404
 * as a token that never existed. Prisma and storage are mocked: the question
 * is what the route decides, not how rows are read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const findUnique = vi.fn()
const getFile = vi.fn()
vi.mock("@/lib/prisma", () => ({ prisma: { recipient: { findUnique: (...a: unknown[]) => findUnique(...a) } } }))
vi.mock("@/lib/esign/storage", () => ({ getFile: (...a: unknown[]) => getFile(...a) }))

const { GET } = await import("./route")

const TOKEN = "a".repeat(32)
const DAY = 24 * 60 * 60 * 1000
const call = () => GET(new Request(`http://localhost/sign/${TOKEN}/file`), { params: Promise.resolve({ token: TOKEN }) })
const recipientWith = (status: string, expiresAt: Date | null = null) => ({
  expiresAt,
  document: { originalKey: "documents/u/d/original.pdf", status },
})

beforeEach(() => {
  findUnique.mockReset()
  getFile.mockReset()
  getFile.mockResolvedValue(new Uint8Array([0x25, 0x50, 0x44, 0x46]))
})

describe("GET /sign/{token}/file", () => {
  it("serves the PDF while the document is out for signing", async () => {
    findUnique.mockResolvedValue(recipientWith("PENDING", new Date(Date.now() + DAY)))
    const response = await call()
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(getFile).toHaveBeenCalledOnce()
  })

  it("serves the PDF on a completed document", async () => {
    findUnique.mockResolvedValue(recipientWith("COMPLETED"))
    expect((await call()).status).toBe(200)
  })

  it.each(["CANCELLED", "REJECTED", "EXPIRED", "DRAFT"])("refuses a %s document without reading storage", async (status) => {
    findUnique.mockResolvedValue(recipientWith(status))
    expect((await call()).status).toBe(404)
    expect(getFile).not.toHaveBeenCalled()
  })

  it("refuses once this recipient's link has expired, before the sweep marks the document", async () => {
    findUnique.mockResolvedValue(recipientWith("PENDING", new Date(Date.now() - DAY)))
    expect((await call()).status).toBe(404)
    expect(getFile).not.toHaveBeenCalled()
  })

  it("refuses an unknown token", async () => {
    findUnique.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
  })
})
