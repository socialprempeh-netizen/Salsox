/**
 * Tests for the webhook payload and its signature (payload.ts): the shape a
 * receiver gets, what is left out, and that signing and verifying agree.
 */
import { describe, expect, it } from "vitest"
import { buildPayload, samplePayload, signatureHeader, verifySignature } from "./payload"

const at = new Date("2026-10-25T12:00:00Z")
const doc = {
  id: "d1",
  title: "Lease",
  status: "PENDING",
  createdAt: new Date("2026-10-25T10:00:00Z"),
  sentAt: new Date("2026-10-25T10:05:00Z"),
  completedAt: null,
  pageCount: 2,
  signingOrder: "SEQUENTIAL",
  recipients: [
    { id: "r2", name: "B", email: "b@example.com", role: "SIGNER", order: 1, signingStatus: "NOT_SIGNED", viewedAt: null, signedAt: null },
    { id: "r1", name: "A", email: "a@example.com", role: "SIGNER", order: 0, signingStatus: "SIGNED", viewedAt: at, signedAt: at },
  ],
}

describe("buildPayload", () => {
  it("has the documented shape, recipients in signing order, the actor picked out", () => {
    const p = buildPayload({ id: "evt_1", event: "document.signed", at, appUrl: "https://app.example.com/", document: doc, recipientId: "r1" })
    expect(p).toMatchObject({ id: "evt_1", event: "document.signed", created_at: "2026-10-25T12:00:00.000Z", test: false })
    expect(p.data.document).toMatchObject({ id: "d1", title: "Lease", sent_at: "2026-10-25T10:05:00.000Z", completed_at: null, url: "https://app.example.com/dashboard/documents/d1" })
    expect(p.data.recipients.map((r) => r.id)).toEqual(["r1", "r2"])
    expect(p.data.recipient?.email).toBe("a@example.com")
    expect(p.data.payment).toBeNull()
  })

  it("never carries a signing token, phone number or IP address", () => {
    const withExtras = { ...doc, recipients: doc.recipients.map((r) => ({ ...r, token: "secret-token", phone: "+233201234567", ipAddress: "10.0.0.1" })) }
    const json = JSON.stringify(buildPayload({ id: "e", event: "document.viewed", at, appUrl: "https://x", document: withExtras, recipientId: "r1" }))
    expect(json).not.toContain("secret-token")
    expect(json).not.toContain("+233")
    expect(json).not.toContain("10.0.0.1")
  })

  it("carries a payment in minor units with a lower-case currency", () => {
    const p = buildPayload({ id: "e", event: "payment.sent", at, appUrl: "https://x", document: doc, recipientId: "r1", payment: { id: "p1", amount: 5000, currency: "GHS", status: "PAID", provider: "PAYSTACK", paidAt: at } })
    expect(p.data.payment).toEqual({ id: "p1", amount: 5000, currency: "ghs", status: "PAID", provider: "PAYSTACK", paid_at: "2026-10-25T12:00:00.000Z" })
  })
})

describe("samplePayload", () => {
  it("is a marked test for each event, with what that event would carry", () => {
    expect(samplePayload("document.sent", "https://x", at)).toMatchObject({ test: true, data: { recipient: null, payment: null } })
    expect(samplePayload("payment.sent", "https://x", at).data.payment?.amount).toBe(25_000)
    expect(samplePayload("document.completed", "https://x", at).data.document.status).toBe("COMPLETED")
    expect(samplePayload("document.declined", "https://x", at).data.recipient?.decline_reason).toBe("The deposit amount is wrong.")
    expect(samplePayload("document.expired", "https://x", at)).toMatchObject({ data: { recipient: null, document: { status: "EXPIRED" } } })
  })
})

describe("signatures", () => {
  const body = JSON.stringify({ hello: "world" })

  it("verify what was signed, within the tolerance", () => {
    const header = signatureHeader("whsec_test", body, at)
    expect(header).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/)
    expect(verifySignature("whsec_test", body, header, new Date(at.getTime() + 60_000))).toBe(true)
  })

  it("refuse another secret, a changed body, or an old timestamp", () => {
    const header = signatureHeader("whsec_test", body, at)
    expect(verifySignature("whsec_other", body, header, at)).toBe(false)
    expect(verifySignature("whsec_test", body + " ", header, at)).toBe(false)
    expect(verifySignature("whsec_test", body, header, new Date(at.getTime() + 10 * 60_000))).toBe(false)
    expect(verifySignature("whsec_test", body, "garbage", at)).toBe(false)
  })
})
