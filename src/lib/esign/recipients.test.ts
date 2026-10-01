/**
 * Tests for re-sending one recipient's link (`resendToRecipient`).
 *
 * A resend is nothing but its email. With no email provider configured it
 * used to count as delivered: the recipient was stamped "Sent", a reminder
 * went into the audit trail, and the sender saw "Sent" for an email that was
 * never attempted. It is now refused with a code the dashboard turns into
 * "Email isn't configured, share the link manually", and nothing is written.
 *
 * Prisma and the modules around the engine are mocked; the real outcome
 * helpers from emails.ts are kept, since they are what decides.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const findRecipient = vi.fn()
const updateRecipient = vi.fn()
const recordAudit = vi.fn()
const sendSigningInvite = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recipient: {
      findFirst: (...a: unknown[]) => findRecipient(...a),
      update: (...a: unknown[]) => updateRecipient(...a),
    },
  },
}))
vi.mock("./audit", () => ({ AUDIT: { REMINDER_SENT: "REMINDER_SENT" }, recordAudit: (...a: unknown[]) => recordAudit(...a), requestMeta: async () => ({}) }))
vi.mock("./emails", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./emails")>()),
  sendSigningInvite: (...a: unknown[]) => sendSigningInvite(...a),
}))
vi.mock("./documents", () => ({ appUrl: () => "http://localhost:3000", renewDocument: vi.fn() }))
vi.mock("./sender", () => ({ senderBlocker: async () => null }))

const { resendToRecipient } = await import("./recipients")

beforeEach(() => {
  vi.clearAllMocks()
  findRecipient.mockResolvedValue({
    id: "rec_1",
    documentId: "doc_1",
    email: "ama@example.com",
    name: "Ama",
    token: "t".repeat(32),
    expiresAt: null,
    sentAt: null,
    document: { title: "Lease", message: null, user: { name: "Sender", email: "sender@example.com" } },
  })
})

describe("resendToRecipient", () => {
  it("refuses when no email provider is configured, and writes nothing", async () => {
    sendSigningInvite.mockResolvedValue("notConfigured")
    expect(await resendToRecipient("u1", "rec_1")).toEqual({ ok: false, error: "emailNotConfigured" })
    expect(updateRecipient).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("reports a provider refusal as a failure to retry", async () => {
    sendSigningInvite.mockResolvedValue("failed")
    expect(await resendToRecipient("u1", "rec_1")).toEqual({ ok: false, error: "emailFailed" })
    expect(updateRecipient).not.toHaveBeenCalled()
  })

  it("stamps the recipient and records the reminder when the email went", async () => {
    sendSigningInvite.mockResolvedValue("sent")
    expect(await resendToRecipient("u1", "rec_1")).toEqual({ ok: true })
    expect(updateRecipient).toHaveBeenCalledOnce()
    expect(recordAudit).toHaveBeenCalledOnce()
  })
})
