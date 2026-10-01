/**
 * Tests for submitting a signature (`saveField`).
 *
 * The case that matters: a signer submits something that is not a usable
 * image. It must be refused at that moment, with the code the signing page
 * turns into "draw it again", and nothing may be written. Before this, the
 * bad image was stored and only failed when the finished document was sealed,
 * which it then could never be.
 *
 * The database is mocked: these tests are about what `saveField` decides and
 * whether it writes, not about Prisma. The modules that reach for email,
 * storage and payment providers are stubbed so the file under test loads
 * alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const TOKEN = "a".repeat(32)
const transaction = vi.fn()
const recordAudit = vi.fn()

const recipient = {
  id: "rec_1",
  documentId: "doc_1",
  email: "ama@example.com",
  name: "Ama",
  role: "SIGNER",
  order: 0,
  signingStatus: "NOT_SIGNED",
  expiresAt: null,
  payments: [],
}
const document = { id: "doc_1", status: "PENDING", signingOrder: "PARALLEL", recipients: [recipient] }

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recipient: { findUnique: async () => ({ ...recipient, document }) },
    field: { findFirst: async () => ({ id: "field_1", recipientId: "rec_1", type: "SIGNATURE" }) },
    $transaction: transaction,
  },
}))
vi.mock("./audit", () => ({
  AUDIT: { FIELD_SIGNED: "FIELD_SIGNED" },
  recordAudit,
  requestMeta: async () => ({ ipAddress: null, userAgent: null }),
}))
vi.mock("./documents", () => ({ finalizeDocument: vi.fn(), appUrl: () => "http://localhost:3000" }))
vi.mock("./emails", () => ({ delivered: () => true, sendDocumentRejected: vi.fn(), sendSigningInvite: vi.fn() }))
vi.mock("./payments", () => ({ getProvider: vi.fn() }))

const { saveField } = await import("./signing")

// 1x1 transparent PNG.
const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const base64 = (text: string) => Buffer.from(text).toString("base64")

beforeEach(() => {
  vi.clearAllMocks()
  transaction.mockImplementation(async (run: (tx: unknown) => Promise<void>) =>
    run({ signature: { upsert: vi.fn() }, field: { update: vi.fn() } })
  )
})

describe("saveField with a drawn signature", () => {
  it("refuses bytes that are not an image, and stores nothing", async () => {
    const corrupt = `data:image/png;base64,${base64("definitely not a PNG, just text")}`
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: corrupt })).toEqual({ ok: false, error: "invalidSignature" })
    expect(transaction).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("refuses a truncated PNG, and stores nothing", async () => {
    const truncated = VALID_PNG.slice(0, VALID_PNG.length - 40)
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: truncated })).toEqual({ ok: false, error: "invalidSignature" })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("refuses a JPEG declared as a PNG, and stores nothing", async () => {
    const mislabelled = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString("base64")}`
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: mislabelled })).toEqual({ ok: false, error: "invalidSignature" })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("stores a valid image", async () => {
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: VALID_PNG })).toEqual({ ok: true })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledTimes(1)
  })

  it("still accepts a typed signature, which has no image to check", async () => {
    expect(await saveField(TOKEN, "field_1", { typedText: "Ama Mensah" })).toEqual({ ok: true })
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})
