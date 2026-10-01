/**
 * Tests for the sender-side document lifecycle (documents.ts): the parts that
 * clean up after themselves and the parts that guard Sign & Pay.
 *
 * Deleting a draft, or an account, used to remove the database rows and leave
 * the uploaded PDFs in storage with nothing pointing at them. These tests pin
 * down that the files go too, and in which order: rows first, so a failure can
 * at worst strand a file, never leave a document whose file is gone.
 *
 * Sending with no email provider configured is covered too: nobody may be
 * stamped "Sent" when no email went out, and a reminder that reached nobody
 * is not recorded as sent.
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
const updateDocuments = vi.fn()
const loadDocument = vi.fn()
const updateRecipients = vi.fn()
const recordAudit = vi.fn()
const sendSigningInvite = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: (...a: unknown[]) => findDocument(...a),
      deleteMany: (...a: unknown[]) => deleteDocuments(...a),
      updateMany: (...a: unknown[]) => updateDocuments(...a),
      findUniqueOrThrow: (...a: unknown[]) => loadDocument(...a),
    },
    recipient: { updateMany: (...a: unknown[]) => updateRecipients(...a) },
    payoutAccount: { findMany: (...a: unknown[]) => findPayouts(...a) },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}))
vi.mock("./storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./storage")>()),
  deleteFile: (...a: unknown[]) => deleteFile(...a),
  deleteFolder: (...a: unknown[]) => deleteFolder(...a),
}))
vi.mock("./audit", () => ({ AUDIT: { SENT: "DOCUMENT_SENT", REMINDER_SENT: "REMINDER_SENT" }, recordAudit: (...a: unknown[]) => recordAudit(...a), requestMeta: async () => ({}) }))
vi.mock("./emails", () => ({ sendSigningInvite: (...a: unknown[]) => sendSigningInvite(...a) }))
// The plan is Business unless a test says otherwise, so the tests about
// other rules are not stopped by a plan gate.
const plan = vi.hoisted(() => ({ current: { tier: "business" as "free" | "personal" | "business", documentsLeft: null as number | null } }))
vi.mock("./sender", () => ({ senderBlocker: async () => null, senderPlan: async () => plan.current }))

const { deleteAccountFiles, deleteDraft, remindDocument, saveDocumentSetup, sendDocument } = await import("./documents")

beforeEach(() => {
  vi.clearAllMocks()
  plan.current = { tier: "business", documentsLeft: null }
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

/**
 * Plan gates (plans.ts): a Business feature on a lower plan is refused with
 * the code the form turns into an upgrade prompt, and nothing is written.
 * Before, every account could use them whatever it paid for.
 */
describe("plan gates on the setup", () => {
  const base: DocumentSetup = {
    title: "Contract",
    signingOrder: "PARALLEL",
    expiresInDays: 30,
    recipients: [{ key: "r1", name: "Ama", email: "ama@example.com", phone: undefined, role: "SIGNER", order: 0 }],
    fields: [],
    payment: null,
  }

  beforeEach(() => {
    findDocument.mockResolvedValue({ id: "doc_1", userId: "u1", status: "DRAFT", pageCount: 1 })
    findPayouts.mockResolvedValue([{ provider: "STRIPE" }])
    transaction.mockResolvedValue(undefined)
  })

  it("refuses Sign & Pay, signing order and approvers on Personal, and writes nothing", async () => {
    plan.current = { tier: "personal", documentsLeft: null }
    const payment = { amount: "12.50", currency: "USD", recipientKey: "r1" }
    expect(await saveDocumentSetup("u1", "doc_1", { ...base, payment })).toEqual({ ok: false, error: "plan_signAndPay" })
    expect(await saveDocumentSetup("u1", "doc_1", { ...base, signingOrder: "SEQUENTIAL" })).toEqual({ ok: false, error: "plan_sequentialSigning" })
    const approver = { ...base, recipients: [{ ...base.recipients[0], role: "APPROVER" as const }] }
    expect(await saveDocumentSetup("u1", "doc_1", approver)).toEqual({ ok: false, error: "plan_approvers" })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("saves a plain parallel setup on the free plan", async () => {
    plan.current = { tier: "free", documentsLeft: 3 }
    expect(await saveDocumentSetup("u1", "doc_1", base)).toEqual({ ok: true })
  })
})

describe("sending when no email provider is configured", () => {
  const signer = (id: string) => ({
    id,
    email: `${id}@example.com`,
    name: id,
    role: "SIGNER",
    order: 0,
    signingStatus: "NOT_SIGNED",
    expiresAt: null,
    sentAt: null,
    viewedAt: null,
    token: `token-${id}`,
    mustPay: false,
  })
  const draft = {
    id: "doc_1",
    userId: "u1",
    title: "Lease",
    message: null,
    status: "DRAFT",
    signingOrder: "PARALLEL",
    expiresInDays: 30,
    paymentAmount: null,
    paymentCurrency: null,
    user: { name: "Sender", email: "sender@example.com" },
    recipients: [signer("a"), signer("b")],
    fields: [{ recipientId: "a" }, { recipientId: "b" }],
  }
  /** Every `sentAt` written to a recipient row, from the updateMany calls. */
  const stampedSent = () => updateRecipients.mock.calls.filter(([arg]) => "sentAt" in (arg as { data: object }).data)

  beforeEach(() => {
    findDocument.mockResolvedValue(draft)
    updateDocuments.mockResolvedValue({ count: 1 })
    loadDocument.mockResolvedValue({ ...draft, status: "PENDING" })
    updateRecipients.mockResolvedValue({ count: 1 })
  })

  it("sends the document but stamps nobody \"Sent\" and reports them as not emailed", async () => {
    sendSigningInvite.mockResolvedValue("notConfigured")
    expect(await sendDocument("u1", "doc_1")).toEqual({ ok: true, undelivered: 0, notEmailed: 2 })
    expect(stampedSent()).toEqual([])
  })

  it("refuses to send once a free account has used its documents this month", async () => {
    plan.current = { tier: "free", documentsLeft: 0 }
    expect(await sendDocument("u1", "doc_1")).toEqual({ ok: false, error: "plan_unlimitedDocuments" })
    expect(updateDocuments).not.toHaveBeenCalled()
    expect(sendSigningInvite).not.toHaveBeenCalled()
  })

  // Saved while on Business, sent after a downgrade: checked again at send.
  it("refuses a Sign & Pay draft on a plan that no longer includes it", async () => {
    plan.current = { tier: "personal", documentsLeft: null }
    findDocument.mockResolvedValue({ ...draft, paymentAmount: 1250, paymentCurrency: "USD" })
    expect(await sendDocument("u1", "doc_1")).toEqual({ ok: false, error: "plan_signAndPay" })
    expect(updateDocuments).not.toHaveBeenCalled()
  })

  it("stamps \"Sent\" when the provider accepted the emails", async () => {
    sendSigningInvite.mockResolvedValue("sent")
    expect(await sendDocument("u1", "doc_1")).toEqual({ ok: true, undelivered: 0, notEmailed: 0 })
    expect(stampedSent()).toHaveLength(1)
    expect(stampedSent()[0][0]).toMatchObject({ where: { id: { in: ["a", "b"] } } })
  })

  it("refuses a reminder that could reach nobody, and records no reminder", async () => {
    findDocument.mockResolvedValue({ ...draft, status: "PENDING" })
    sendSigningInvite.mockResolvedValue("notConfigured")
    expect(await remindDocument("u1", "doc_1")).toEqual({ ok: false, error: "emailNotConfigured" })
    expect(recordAudit).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "REMINDER_SENT" }))
    expect(updateRecipients).not.toHaveBeenCalled()
  })
})
