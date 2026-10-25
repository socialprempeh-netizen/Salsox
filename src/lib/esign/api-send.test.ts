/**
 * Tests for sending from the public API (api-send.ts): each request takes a
 * send path the product already has (Quick Send, or the editor's save and
 * send), a template's people land on its roles, and a draft whose send is
 * refused is deleted, not left in the account.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const quickSend = vi.fn()
const createDraftFromUpload = vi.fn()
const saveDocumentSetup = vi.fn()
const sendDocument = vi.fn()
const deleteDraft = vi.fn()
const createDraftFromTemplate = vi.fn()
const findUniqueOrThrow = vi.fn()

vi.mock("./documents", () => ({
  quickSend: (...a: unknown[]) => quickSend(...a),
  createDraftFromUpload: (...a: unknown[]) => createDraftFromUpload(...a),
  saveDocumentSetup: (...a: unknown[]) => saveDocumentSetup(...a),
  sendDocument: (...a: unknown[]) => sendDocument(...a),
  deleteDraft: (...a: unknown[]) => deleteDraft(...a),
}))
vi.mock("./templates", () => ({ createDraftFromTemplate: (...a: unknown[]) => createDraftFromTemplate(...a) }))
vi.mock("@/lib/prisma", () => ({ prisma: { document: { findUniqueOrThrow: (...a: unknown[]) => findUniqueOrThrow(...a) } } }))

const { sendFromApi, fitsQuickSend } = await import("./api-send")
type Args = Parameters<typeof sendFromApi>[0]

const bytes = new Uint8Array([1, 2, 3])
const base = { userId: "u1", sender: { name: "Owner", email: "owner@example.com" }, title: "Lease", expiresInDays: 30, signingOrder: "PARALLEL" as const }
const signer = (email: string) => ({ email, role: "SIGNER" as const, order: 0 })

beforeEach(() => {
  vi.resetAllMocks()
  saveDocumentSetup.mockResolvedValue({ ok: true })
  sendDocument.mockResolvedValue({ ok: true, undelivered: 0, notEmailed: 0 })
})

describe("sendFromApi", () => {
  it("sends a plain PDF to signers through Quick Send", async () => {
    quickSend.mockResolvedValue({ ok: true, documentId: "d1", undelivered: 0, notEmailed: 0 })
    const out = await sendFromApi({ ...base, recipients: [signer("a@example.com")], source: { kind: "pdf", bytes, fields: null } })
    expect(out).toEqual({ ok: true, documentId: "d1", undelivered: 0, notEmailed: 0 })
    expect(quickSend).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", signers: [{ email: "a@example.com", name: undefined }], expiresInDays: 30 }))
    expect(createDraftFromUpload).not.toHaveBeenCalled()
  })

  it("takes the editor's path when fields are given", async () => {
    createDraftFromUpload.mockResolvedValue({ ok: true, documentId: "d2" })
    const fields = [{ recipientIndex: 0, type: "SIGNATURE" as const, page: 1, x: 10, y: 80, width: 30, height: 6, required: true }]
    const out = await sendFromApi({ ...base, recipients: [signer("a@example.com")], source: { kind: "pdf", bytes, fields } })
    expect(out.ok).toBe(true)
    const setup = saveDocumentSetup.mock.calls[0][2]
    expect(setup.recipients).toEqual([expect.objectContaining({ key: "r0", email: "a@example.com", name: "A" })])
    expect(setup.fields).toEqual([expect.objectContaining({ recipientKey: "r0", type: "SIGNATURE" })])
    expect(sendDocument).toHaveBeenCalledWith("u1", "d2")
  })

  it("asks for fields when Quick Send cannot take the request", async () => {
    const approver = { email: "b@example.com", role: "APPROVER" as const, order: 0 }
    expect(fitsQuickSend({ signingOrder: "PARALLEL", recipients: [approver] }, null)).toBe(false)
    expect(fitsQuickSend({ signingOrder: "SEQUENTIAL", recipients: [signer("a@example.com")] }, null)).toBe(false)
    const out = await sendFromApi({ ...base, recipients: [approver], source: { kind: "pdf", bytes, fields: null } })
    expect(out).toEqual({ ok: false, error: "fieldsRequired" })
    expect(createDraftFromUpload).not.toHaveBeenCalled()
  })

  it("deletes the draft when the send is refused", async () => {
    createDraftFromUpload.mockResolvedValue({ ok: true, documentId: "d3" })
    sendDocument.mockResolvedValue({ ok: false, error: "emailNotConfirmed" })
    const fields = [{ recipientIndex: 0, type: "SIGNATURE" as const, page: 1, x: 10, y: 80, width: 30, height: 6, required: true }]
    const out = await sendFromApi({ ...base, recipients: [signer("a@example.com")], source: { kind: "pdf", bytes, fields } })
    expect(out).toEqual({ ok: false, error: "emailNotConfirmed" })
    expect(deleteDraft).toHaveBeenCalledWith("u1", "d3")
  })

  it("puts a template's people on its roles and keeps the sender's own", async () => {
    createDraftFromTemplate.mockResolvedValue({ ok: true, documentId: "d4" })
    findUniqueOrThrow.mockResolvedValue({
      recipients: [
        { id: "rA", name: "Owner", email: "owner@example.com", order: 0 },
        { id: "rB", name: "Tenant", email: "", order: 1 },
      ],
      fields: [{ recipientId: "rB", type: "SIGNATURE", page: 2, x: 8, y: 70, width: 40, height: 6, required: true, label: null }],
    })
    const tenant = { email: "t@example.com", name: "Kofi", role: "SIGNER" as const, order: 0 }
    const template = { roles: [{ id: "landlord", label: "Landlord", you: true }, { id: "tenant", label: "Tenant", you: false }] } as unknown as Extract<Args["source"], { kind: "template" }>["template"]
    const out = await sendFromApi({ ...base, recipients: [tenant], source: { kind: "template", template, values: { Rent: "500" }, byRole: new Map([["tenant", tenant]]) } })
    expect(out).toEqual({ ok: true, documentId: "d4", undelivered: 0, notEmailed: 0 })
    expect(createDraftFromTemplate).toHaveBeenCalledWith(expect.objectContaining({ values: { Rent: "500" }, sender: base.sender }))
    const setup = saveDocumentSetup.mock.calls[0][2]
    expect(setup.recipients.map((r: { key: string; email: string; name: string }) => [r.key, r.email, r.name])).toEqual([["rA", "owner@example.com", "Owner"], ["rB", "t@example.com", "Kofi"]])
    expect(setup.fields).toEqual([expect.objectContaining({ recipientKey: "rB", page: 2, label: undefined })])
  })
})
