"use server"

import { checkRateLimit, rateLimitKeyFromIp } from "@/lib/rate-limit"
import { isSha256, parseVerificationQuery, verifyDocument, type VerificationResult } from "@/lib/esign/verify"

/**
 * The public "verify a document" lookup, called by the form on /verify.
 *
 * Unauthenticated by design: whoever holds a signed PDF is the audience, and
 * most of them have no account. What makes that safe lives in
 * src/lib/esign/verify.ts (only sealed documents answer, nothing of their
 * content is returned); this file adds the two things a public endpoint needs
 * on top: it re-parses what arrives, whatever the form already checked, and it
 * limits each IP, so the page cannot be used to walk through document ids.
 *
 * `fileSha256` is the fingerprint of a PDF the visitor dropped on the page,
 * computed in their browser. The file itself never reaches the server.
 */

/** Lookups per IP per window (the limiter's default window). */
const LOOKUPS_PER_WINDOW = 20

/** The result as it crosses to the client: dates as ISO strings. */
export type VerifyState =
  | { status: "idle" }
  | { status: "invalid" }
  | { status: "rateLimited" }
  | { status: "notFound" }
  | {
      status: "verified"
      documentId: string
      verificationCode: string | null
      completedAt: string
      signers: { name: string; email: string; role: "SIGNER" | "APPROVER"; signedAt: string | null }[]
      originalSha256: string
      sealedSha256: string
      fileMatches?: boolean
    }

export async function verifyDocumentAction(input: unknown, fileSha256?: unknown): Promise<VerifyState> {
  const query = typeof input === "string" ? parseVerificationQuery(input) : null
  if (!query) return { status: "invalid" }
  const hash = typeof fileSha256 === "string" && isSha256(fileSha256) ? fileSha256 : null

  if (!(await checkRateLimit(await rateLimitKeyFromIp("verify"), LOOKUPS_PER_WINDOW))) {
    return { status: "rateLimited" }
  }

  return serialize(await verifyDocument(query, hash))
}

function serialize(result: VerificationResult): VerifyState {
  if (result.state === "notFound") return { status: "notFound" }
  return {
    status: "verified",
    documentId: result.documentId,
    verificationCode: result.verificationCode,
    completedAt: result.completedAt.toISOString(),
    signers: result.signers.map((s) => ({ ...s, signedAt: s.signedAt?.toISOString() ?? null })),
    originalSha256: result.originalSha256,
    sealedSha256: result.sealedSha256,
    ...(result.fileMatches === undefined ? {} : { fileMatches: result.fileMatches }),
  }
}
