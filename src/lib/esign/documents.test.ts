/**
 * Tests for the sender-side document lifecycle (documents.ts): the parts that
 * clean up after themselves and the parts that guard Sign & Pay.
 *
 * Deleting a draft, or an account, used to remove the database rows and leave
 * the uploaded PDFs in storage with nothing pointing at them. These tests pin
 * down that the files go too, and in which order: rows first, so a failure can
 * at worst strand a file, never leave a document whose file is gone.
 *
 * Prisma and storage are mocked; so are the modules that reach for email,
 * so the file under test loads alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { DocumentSetup } from "./schemas"

const findDocument = vi.fn()
const deleteDocuments = vi.fn()
const findPayouts = vi.fn()
const transaction = vi.fn()
const deleteFile = vi.fn()
const deleteFolder = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: (...a: unknown[]) => findDocument(...a),
      deleteMany: (...a: unknown[]) => deleteDocuments(...a),
    },
    payoutAccount: { findMany: (...a: unknown[]) => findPayouts(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}))
vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  deleteFile: (...a: unknown[]) => deleteFile(...a),
  deleteFolder: (...a: unknown[]) => deleteFolder(...a),
}))
vi.mock("./audit", () => ({ AUDIT: {}, recordAudit: vi.fn(), requestMeta: async () => ({}) }))
vi.mock("./emails", () => ({ delivered: () => true }))

const { deleteAccountFiles, deleteDraft, saveDocumentSetup } = await import("./documents")

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  deleteFile.mockResolvedValue(undefined)
  deleteFolder.mockResolvedValue(undefined)
})

describe("deleteDraft", () => {
  it("deletes the draft's stored PDF after its row", async () => {
    const order: string[] = []
    findDocument.mockResolvedValue({ originalKey: "documents/u1/abc/original.pdf", sealedKey: null })
    deleteDocuments.mockImplementation(async () => (order.push("row"), { count: 1 }))
    deleteFile.mockImplementation(async (key: string) => void order.push(key))

    expect(await deleteDraft("u1", "doc_1")).toEqual({ ok: true })
    expect(order).toEqual(["row", "documents/u1/abc/original.pdf"])
    expect(deleteDocuments).toHaveBeenCalledWith({ where: { id: "doc_1", userId: "u1", status: "DRAFT" } })
  })

  it("leaves storage alone when the document is not the user's draft", async () => {
    findDocument.mockResolvedValue(null)
    expect(await deleteDraft("u1", "doc_1")).toEqual({ ok: false, error: "notDraft" })
    expect(deleteDocuments).not.toHaveBeenCalled()
    expect(deleteFile).not.toHaveBeenCalled()
  })

  it("keeps the file when the document was sent between the read and the delete", async () => {
    findDocument.mockResolvedValue({ originalKey: "documents/u1/abc/original.pdf", sealedKey: null })
    deleteDocuments.mockResolvedValue({ count: 0 })
    expect(await deleteDraft("u1", "doc_1")).toEqual({ ok: false, error: "notDraft" })
    expect(deleteFile).not.toHaveBeenCalled()
  })

  it("still reports the draft deleted when storage refuses, and logs it", async () => {
    findDocument.mockResolvedValue({ originalKey: "documents/u1/abc/original.pdf", sealedKey: null })
    deleteDocuments.mockResolvedValue({ count: 1 })
    deleteFile.mockRejectedValue(new Error("storage down"))
    expect(await deleteDraft("u1", "doc_1")).toEqual({ ok: true })
    expect(console.error).toHaveBeenCalled()
  })
})

describe("deleteAccountFiles", () => {
  it("removes the user's whole storage folder", async () => {
    await deleteAccountFiles("user_1")
    expect(deleteFolder).toHaveBeenCalledWith("documents/user_1/")
  })

  it("logs a storage failure instead of throwing: the account is already gone", async () => {
    deleteFolder.mockRejectedValue(new Error("storage down"))
    await expect(deleteAccountFiles("user_1")).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})

/**
 * The schema refuses a currency outside the offered list, but the engine is
 * the authority and checks again: a setup that reaches it some other way with
 * a zero-decimal currency must not be saved, because "12.50" stored as 1250
 * would be charged as 1,250 yen.
 */
describe("saveDocumentSetup with a crafted currency", () => {
  const setup = (currency: string): DocumentSetup => ({
    title: "Invoice",
    signingOrder: "PARALLEL",
    expiresInDays: 30,
    recipients: [{ key: "r1", name: "Ama", email: "ama@example.com", phone: undefined, role: "SIGNER", order: 0 }],
    fields: [],
    payment: { amount: "12.50", currency, recipientKey: "r1" },
  })

  beforeEach(() => {
    findDocument.mockResolvedValue({ id: "doc_1", userId: "u1", status: "DRAFT", pageCount: 1 })
    findPayouts.mockResolvedValue([{ provider: "STRIPE" }])
  })

  it("refuses a zero-decimal currency and writes nothing", async () => {
    for (const currency of ["JPY", "KRW", "XOF"]) {
      expect(await saveDocumentSetup("u1", "doc_1", setup(currency))).toEqual({ ok: false, error: "invalidCurrency" })
    }
    expect(transaction).not.toHaveBeenCalled()
  })

  it("saves an offered currency", async () => {
    transaction.mockResolvedValue(undefined)
    expect(await saveDocumentSetup("u1", "doc_1", setup("USD"))).toEqual({ ok: true })
    expect(transaction).toHaveBeenCalledOnce()
  })
})
