/**
 * Tests for public document verification (verify.ts): codes read the way
 * people type them, only sealed documents verify, and what the public sees
 * stops at who signed and when.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import {
  formatVerificationCode,
  isSha256,
  maskEmail,
  newVerificationCode,
  parseVerificationQuery,
  toVerificationResult,
  verificationUrl,
} from "./verify"

const SEALED = "a".repeat(64)

function doc(overrides: Partial<Parameters<typeof toVerificationResult>[0] & object> = {}) {
  return {
    id: "cmgabcdefghijklmnopqrstuv",
    status: "COMPLETED",
    verificationCode: "7K3M-Q9TX-2HVD",
    completedAt: new Date("2026-10-01T10:00:00Z"),
    sealedKey: "u/doc/sealed.pdf",
    sealedSha256: SEALED,
    originalSha256: "b".repeat(64),
    recipients: [
      { name: "Kofi Owusu", email: "kofi@example.com", role: "SIGNER" as const, signedAt: new Date("2026-10-01T09:59:00Z"), signingStatus: "SIGNED", order: 1 },
      { name: "Ama Mensah", email: "ama.mensah@example.com", role: "SIGNER" as const, signedAt: new Date("2026-09-30T08:00:00Z"), signingStatus: "SIGNED", order: 0 },
      { name: "Legal", email: "legal@example.com", role: "CC" as const, signedAt: null, signingStatus: "NOT_SIGNED", order: 2 },
    ],
    ...overrides,
  }
}

describe("verification codes", () => {
  it("issues unique codes in the printed XXXX-XXXX-XXXX shape", () => {
    const codes = new Set(Array.from({ length: 200 }, newVerificationCode))
    expect(codes.size).toBe(200)
    for (const code of codes) expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/)
  })

  it("every issued code reads back as itself", () => {
    const code = newVerificationCode()
    expect(parseVerificationQuery(code)).toEqual({ kind: "code", code })
  })

  it("builds the link printed under the QR code", () => {
    expect(verificationUrl("https://app.example.com/", "7K3M-Q9TX-2HVD")).toBe("https://app.example.com/verify?code=7K3M-Q9TX-2HVD")
  })

  it("groups twelve characters in fours", () => {
    expect(formatVerificationCode("7K3MQ9TX2HVD")).toBe("7K3M-Q9TX-2HVD")
  })
})

describe("parseVerificationQuery", () => {
  // Read off paper or a phone screen: case, spacing and the letters that look
  // like digits all vary.
  it("forgives how a code is typed", () => {
    for (const typed of ["7k3m-q9tx-2hvd", " 7K3M Q9TX 2HVD ", "7K3MQ9TX2HVD"]) {
      expect(parseVerificationQuery(typed)).toEqual({ kind: "code", code: "7K3M-Q9TX-2HVD" })
    }
    expect(parseVerificationQuery("OIL0-0000-0000")).toEqual({ kind: "code", code: "0110-0000-0000" })
  })

  it("recognises a document id as printed on the certificate", () => {
    expect(parseVerificationQuery("cmgabcdefghijklmnopqrstuv")).toEqual({ kind: "id", id: "cmgabcdefghijklmnopqrstuv" })
  })

  it("refuses anything that is neither, before any lookup", () => {
    for (const junk of ["", "   ", "hello", "7K3M-Q9TX", "7K3M-Q9TX-2HVD-XXXX", "UUUU-UUUU-UUUU", "'; drop table", "x".repeat(200)]) {
      expect(parseVerificationQuery(junk)).toBeNull()
    }
  })
})

describe("maskEmail", () => {
  it("keeps the first letter and the domain", () => {
    expect(maskEmail("ama.mensah@example.com")).toBe("a•••@example.com")
  })

  it("never echoes something that is not an address", () => {
    expect(maskEmail("nonsense")).toBe("•••")
  })
})

describe("isSha256", () => {
  it("accepts a lower-case hex digest and nothing else", () => {
    expect(isSha256(SEALED)).toBe(true)
    expect(isSha256("A".repeat(64))).toBe(false)
    expect(isSha256("a".repeat(63))).toBe(false)
  })
})

describe("toVerificationResult", () => {
  it("verifies a completed, sealed document with its signers in signing order", () => {
    const result = toVerificationResult(doc())
    expect(result.state).toBe("verified")
    if (result.state !== "verified") return
    expect(result.signers.map((s) => s.name)).toEqual(["Ama Mensah", "Kofi Owusu"])
    expect(result.sealedSha256).toBe(SEALED)
  })

  it("masks signer addresses and leaves out recipients who only received a copy", () => {
    const result = toVerificationResult(doc())
    if (result.state !== "verified") throw new Error("expected verified")
    expect(result.signers.map((s) => s.email)).toEqual(["a•••@example.com", "k•••@example.com"])
    expect(result.signers.some((s) => s.name === "Legal")).toBe(false)
  })

  // The public page proves a record exists; it does not publish it.
  it("never carries the title, the message or the file", () => {
    const result = toVerificationResult({ ...doc(), title: "Termination letter", message: "secret" } as never)
    expect(JSON.stringify(result)).not.toMatch(/Termination|secret|sealed\.pdf/)
  })

  it("answers an unsealed or unfinished document exactly like an unknown one", () => {
    for (const status of ["DRAFT", "PENDING", "CANCELLED", "EXPIRED", "REJECTED"]) {
      expect(toVerificationResult(doc({ status }))).toEqual({ state: "notFound" })
    }
    expect(toVerificationResult(doc({ sealedKey: null }))).toEqual({ state: "notFound" })
    expect(toVerificationResult(null)).toEqual({ state: "notFound" })
  })

  it("says whether a dropped file is the sealed copy, byte for byte", () => {
    const match = toVerificationResult(doc(), SEALED)
    const other = toVerificationResult(doc(), "c".repeat(64))
    expect(match.state === "verified" && match.fileMatches).toBe(true)
    expect(other.state === "verified" && other.fileMatches).toBe(false)
    const unchecked = toVerificationResult(doc())
    expect(unchecked.state === "verified" && "fileMatches" in unchecked).toBe(false)
  })
})
