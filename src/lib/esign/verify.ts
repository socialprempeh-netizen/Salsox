/**
 * Public verification of a signed document: the rules behind /verify.
 *
 * Anyone holding a sealed PDF can ask "is this genuine, and who signed it?"
 * without an account. They type the verification code (or the document ID)
 * printed on the certificate page, or follow its QR code, and optionally drop
 * the PDF itself, which is hashed in their browser and compared with the
 * fingerprint stored when the document was sealed. The file never leaves
 * their device.
 *
 * What is disclosed, and what is not:
 * - Only completed, sealed documents verify. A draft, a pending, a cancelled
 *   or an expired document answers exactly like an unknown one, so the page
 *   cannot be used to learn that a document exists before it is signed.
 * - The answer carries the completion date, the signers (name, role, signing
 *   date, and their email masked to its first letter and domain) and the two
 *   SHA-256 fingerprints. Never the title, the message, a field value or the
 *   file: the page proves a record exists, it does not publish its contents.
 * - Lookups are rate limited per IP by the caller (the action), because a
 *   document ID is not a secret-grade value.
 *
 * Codes are 12 Crockford base32 characters (60 random bits), shown as
 * XXXX-XXXX-XXXX. Crockford because it is read off paper: no I, L, O or U,
 * and a typed I, L or O is read as the digit it resembles.
 */
import { randomBytes } from "node:crypto"
import type { RecipientRole } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { isActionable } from "./rules"

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const CODE_LENGTH = 12

/** A fresh verification code, formatted for print: XXXX-XXXX-XXXX. */
export function newVerificationCode(): string {
  // 256 is a multiple of 32, so masking each byte to 5 bits is unbiased.
  const chars = [...randomBytes(CODE_LENGTH)].map((byte) => CROCKFORD[byte & 31])
  return formatVerificationCode(chars.join(""))
}

/** Groups 12 characters in fours. */
export function formatVerificationCode(raw: string): string {
  return raw.match(/.{1,4}/g)?.join("-") ?? raw
}

/** The link printed under the QR code on the certificate. */
export function verificationUrl(appUrl: string, code: string): string {
  return `${appUrl.replace(/\/+$/, "")}/verify?code=${encodeURIComponent(code)}`
}

export type VerificationQuery = { kind: "code"; code: string } | { kind: "id"; id: string }

/**
 * Reads what a person typed or pasted, in either form, and says which one it
 * is. Null for anything that cannot be either, so junk never reaches the
 * database. Forgiving about how a code is typed (case, spaces, dashes, and the
 * letters Crockford reads as digits); strict about what is left.
 */
export function parseVerificationQuery(input: string): VerificationQuery | null {
  const trimmed = input.trim()
  if (!trimmed || trimmed.length > 64) return null

  // Document ids are cuids: a lower-case "c" and 24 more letters and digits.
  // The certificate prints them as is, so they are matched as is.
  if (/^c[a-z0-9]{24}$/.test(trimmed)) return { kind: "id", id: trimmed }

  const compact = trimmed
    .toUpperCase()
    .replace(/[\s-]+/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
  if (compact.length !== CODE_LENGTH) return null
  if (![...compact].every((c) => CROCKFORD.includes(c))) return null
  return { kind: "code", code: formatVerificationCode(compact) }
}

/** True when `value` looks like a SHA-256 hex digest. */
export function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value)
}

/**
 * "ama.mensah@example.com" becomes "a•••@example.com". Enough for a signer to
 * recognise their own address and for a verifier to match it against one they
 * know; not enough to harvest addresses from the page.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at <= 0) return "•••"
  return `${email[0]}•••${email.slice(at)}`
}

export type VerifiedSigner = {
  name: string
  email: string
  role: "SIGNER" | "APPROVER"
  signedAt: Date | null
}

export type VerificationResult =
  | { state: "notFound" }
  | {
      state: "verified"
      documentId: string
      verificationCode: string | null
      completedAt: Date
      signers: VerifiedSigner[]
      originalSha256: string
      sealedSha256: string
      /** Only when a file fingerprint was checked: does it match the sealed copy? */
      fileMatches?: boolean
    }

type VerifiableDocument = {
  id: string
  status: string
  verificationCode: string | null
  completedAt: Date | null
  sealedKey: string | null
  sealedSha256: string | null
  originalSha256: string
  recipients: { name: string; email: string; role: RecipientRole; signedAt: Date | null; signingStatus: string; order: number }[]
}

/**
 * What the public may see of a document row. Anything short of completed and
 * sealed is "not found": see the note at the top of the file.
 */
export function toVerificationResult(document: VerifiableDocument | null, fileSha256?: string | null): VerificationResult {
  if (!document || document.status !== "COMPLETED" || !document.sealedKey || !document.sealedSha256 || !document.completedAt) {
    return { state: "notFound" }
  }
  const signers = document.recipients
    .filter((r) => isActionable(r.role) && r.signingStatus === "SIGNED")
    .sort((a, b) => a.order - b.order || (a.signedAt?.getTime() ?? 0) - (b.signedAt?.getTime() ?? 0))
    .map((r) => ({ name: r.name, email: maskEmail(r.email), role: r.role as VerifiedSigner["role"], signedAt: r.signedAt }))
  const result: VerificationResult = {
    state: "verified",
    documentId: document.id,
    verificationCode: document.verificationCode,
    completedAt: document.completedAt,
    signers,
    originalSha256: document.originalSha256,
    sealedSha256: document.sealedSha256,
  }
  if (fileSha256) result.fileMatches = fileSha256.toLowerCase() === document.sealedSha256.toLowerCase()
  return result
}

/** Looks a document up by code or id and returns only what may be shown. */
export async function verifyDocument(query: VerificationQuery, fileSha256?: string | null): Promise<VerificationResult> {
  const document = await prisma.document.findUnique({
    where: query.kind === "code" ? { verificationCode: query.code } : { id: query.id },
    select: {
      id: true,
      status: true,
      verificationCode: true,
      completedAt: true,
      sealedKey: true,
      sealedSha256: true,
      originalSha256: true,
      recipients: { select: { name: true, email: true, role: true, signedAt: true, signingStatus: true, order: true } },
    },
  })
  return toVerificationResult(document, fileSha256 && isSha256(fileSha256.toLowerCase()) ? fileSha256 : null)
}
