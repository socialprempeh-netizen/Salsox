import { describe, expect, it } from "vitest"
import {
  canEditRecipient,
  canViewOriginal,
  canRenewDocument,
  computeExpiry,
  isDocumentComplete,
  isRecipientTurn,
  missingRequiredFields,
  paymentOutstanding,
  recipientsToNotify,
  shouldExpireDocument,
  signingBlocker,
  undeliveredInvites,
  type RuleRecipient,
} from "./rules"

const now = new Date("2026-09-29T12:00:00Z")
const past = new Date("2026-09-28T12:00:00Z")
const future = new Date("2026-10-10T12:00:00Z")

function r(id: string, over: Partial<RuleRecipient> = {}): RuleRecipient {
  return { id, role: "SIGNER", order: 0, signingStatus: "NOT_SIGNED", expiresAt: null, ...over }
}

const pending = { status: "PENDING" as const, signingOrder: "PARALLEL" as const }

describe("computeExpiry", () => {
  it("adds whole days", () => {
    expect(computeExpiry(7, now)?.toISOString()).toBe("2026-10-06T12:00:00.000Z")
  })
  it("returns null for no expiry", () => {
    expect(computeExpiry(null, now)).toBeNull()
    expect(computeExpiry(0, now)).toBeNull()
  })
})

describe("signingBlocker", () => {
  it("lets a pending signer sign", () => {
    const a = r("a")
    expect(signingBlocker(pending, a, [a], now)).toBeNull()
  })
  it("blocks CC and viewers", () => {
    const cc = r("cc", { role: "CC" })
    expect(signingBlocker(pending, cc, [cc], now)).toBe("NO_ACTION_REQUIRED")
  })
  it("blocks a second signature", () => {
    const a = r("a", { signingStatus: "SIGNED" })
    expect(signingBlocker(pending, a, [a], now)).toBe("ALREADY_SIGNED")
  })
  it("reports expiry on an expired link or an expired document", () => {
    const a = r("a", { expiresAt: past })
    expect(signingBlocker(pending, a, [a], now)).toBe("EXPIRED")
    const b = r("b", { expiresAt: future })
    expect(signingBlocker({ ...pending, status: "EXPIRED" }, b, [b], now)).toBe("EXPIRED")
  })
  it("blocks drafts, cancelled and completed documents", () => {
    const a = r("a")
    for (const status of ["DRAFT", "CANCELLED", "COMPLETED"] as const) {
      expect(signingBlocker({ ...pending, status }, a, [a], now)).toBe("DOCUMENT_NOT_PENDING")
    }
  })
  it("enforces sequential order", () => {
    const first = r("a", { order: 0 })
    const second = r("b", { order: 1 })
    const seq = { ...pending, signingOrder: "SEQUENTIAL" as const }
    expect(signingBlocker(seq, second, [first, second], now)).toBe("NOT_YOUR_TURN")
    expect(signingBlocker(seq, second, [{ ...first, signingStatus: "SIGNED" }, second], now)).toBeNull()
  })
})

describe("isRecipientTurn", () => {
  it("ignores CC recipients with a lower order", () => {
    const cc = r("cc", { role: "CC", order: 0 })
    const a = r("a", { order: 1 })
    expect(isRecipientTurn(a, [cc, a], "SEQUENTIAL")).toBe(true)
  })
})

describe("recipientsToNotify", () => {
  const a = r("a", { order: 0 })
  const b = r("b", { order: 1 })
  const c = r("c", { order: 1 })
  const cc = r("cc", { role: "CC" })
  it("notifies every pending signer in parallel", () => {
    expect(recipientsToNotify([a, b, cc], "PARALLEL").map((x) => x.id)).toEqual(["a", "b"])
  })
  it("notifies only the lowest pending group in sequence", () => {
    expect(recipientsToNotify([a, b, c], "SEQUENTIAL").map((x) => x.id)).toEqual(["a"])
    const signedA = { ...a, signingStatus: "SIGNED" as const }
    expect(recipientsToNotify([signedA, b, c], "SEQUENTIAL").map((x) => x.id)).toEqual(["b", "c"])
  })
})

describe("undeliveredInvites", () => {
  const sentAt = new Date("2026-09-29T10:00:00Z")
  const a = { ...r("a", { order: 0 }), sentAt: null, viewedAt: null }
  const b = { ...r("b", { order: 1 }), sentAt: null, viewedAt: null }
  it("lists pending recipients whose email never went", () => {
    const reached = { ...r("c"), sentAt, viewedAt: null }
    expect(undeliveredInvites("PENDING", [a, reached], "PARALLEL").map((x) => x.id)).toEqual(["a"])
  })
  it("does not count someone whose turn has not come", () => {
    expect(undeliveredInvites("PENDING", [{ ...a, sentAt }, b], "SEQUENTIAL")).toEqual([])
    expect(undeliveredInvites("PENDING", [a, b], "SEQUENTIAL").map((x) => x.id)).toEqual(["a"])
  })
  it("ignores signed recipients, CCs and documents that are not pending", () => {
    const signed = { ...r("s", { signingStatus: "SIGNED" }), sentAt: null, viewedAt: null }
    const cc = { ...r("cc", { role: "CC" }), sentAt: null, viewedAt: null }
    expect(undeliveredInvites("PENDING", [signed, cc], "PARALLEL")).toEqual([])
    expect(undeliveredInvites("EXPIRED", [a], "PARALLEL")).toEqual([])
  })
  it("drops someone who opened their link anyway", () => {
    expect(undeliveredInvites("PENDING", [{ ...a, viewedAt: sentAt }], "PARALLEL")).toEqual([])
  })
})

describe("isDocumentComplete", () => {
  it("needs every actionable recipient signed", () => {
    const a = r("a", { signingStatus: "SIGNED" })
    const b = r("b")
    expect(isDocumentComplete([a, b])).toBe(false)
    expect(isDocumentComplete([a, { ...b, signingStatus: "SIGNED" }])).toBe(true)
  })
  it("is never complete with only CC recipients", () => {
    expect(isDocumentComplete([r("cc", { role: "CC" })])).toBe(false)
  })
})

describe("missingRequiredFields", () => {
  it("returns only this recipient's empty required fields", () => {
    const fields = [
      { id: "1", recipientId: "a", required: true, inserted: false },
      { id: "2", recipientId: "a", required: false, inserted: false },
      { id: "3", recipientId: "a", required: true, inserted: true },
      { id: "4", recipientId: "b", required: true, inserted: false },
    ]
    expect(missingRequiredFields(fields, "a").map((f) => f.id)).toEqual(["1"])
  })
})

describe("paymentOutstanding", () => {
  it("only gates the paying recipient on a paid document", () => {
    expect(paymentOutstanding({ paymentAmount: 5000 }, { mustPay: true }, false)).toBe(true)
    expect(paymentOutstanding({ paymentAmount: 5000 }, { mustPay: true }, true)).toBe(false)
    expect(paymentOutstanding({ paymentAmount: 5000 }, { mustPay: false }, false)).toBe(false)
    expect(paymentOutstanding({ paymentAmount: null }, { mustPay: true }, false)).toBe(false)
  })
})

describe("editing and renewing", () => {
  it("allows correcting an unsigned recipient on a live or expired document", () => {
    expect(canEditRecipient("PENDING", { signingStatus: "NOT_SIGNED" })).toBe(true)
    expect(canEditRecipient("EXPIRED", { signingStatus: "NOT_SIGNED" })).toBe(true)
    expect(canEditRecipient("PENDING", { signingStatus: "SIGNED" })).toBe(false)
    expect(canEditRecipient("COMPLETED", { signingStatus: "NOT_SIGNED" })).toBe(false)
  })
  it("renews pending and expired documents only", () => {
    expect(canRenewDocument("EXPIRED")).toBe(true)
    expect(canRenewDocument("PENDING")).toBe(true)
    expect(canRenewDocument("CANCELLED")).toBe(false)
  })
})

describe("shouldExpireDocument", () => {
  it("expires a pending document once an unsigned link lapses", () => {
    const a = r("a", { expiresAt: past })
    expect(shouldExpireDocument(pending, [a], now)).toBe(true)
    expect(shouldExpireDocument(pending, [{ ...a, signingStatus: "SIGNED" }], now)).toBe(false)
    expect(shouldExpireDocument({ status: "COMPLETED" }, [a], now)).toBe(false)
  })
})

describe("canViewOriginal", () => {
  it("serves the file on a live link and on a finished document", () => {
    expect(canViewOriginal("PENDING", { expiresAt: future }, now)).toBe(true)
    expect(canViewOriginal("PENDING", { expiresAt: null }, now)).toBe(true)
    expect(canViewOriginal("COMPLETED", { expiresAt: past }, now)).toBe(true)
  })

  it("refuses drafts and withdrawn documents: cancelled, declined, expired", () => {
    for (const status of ["DRAFT", "CANCELLED", "REJECTED", "EXPIRED"] as const) {
      expect(canViewOriginal(status, { expiresAt: future }, now)).toBe(false)
    }
  })

  it("refuses a pending document once this recipient's own link has run out", () => {
    expect(canViewOriginal("PENDING", { expiresAt: past }, now)).toBe(false)
    expect(canViewOriginal("PENDING", { expiresAt: now }, now)).toBe(false)
  })
})
