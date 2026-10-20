/**
 * TEMPORARY. Facts about GA_SERVICE_ACCOUNT_KEY_BASE64, for finding out why
 * parseServiceAccountKey (traffic.ts) rejects the value set in production
 * without anyone having to read the dashboard. Served only by the admin route
 * /api/admin/debug/ga-key. Remove both once the key is fixed.
 *
 * Reports shapes, never contents: lengths and yes/no answers. No slice of the
 * value, the decoded JSON, the client email or the private key leaves here.
 */

export type KeyDiagnostics = {
  present: boolean
  /** Length as stored, and after trimming; a difference means stray whitespace or newlines. */
  length: number
  trimmedLength: number
  /** Wrapped in quotes, as happens when a value is pasted from a .env line. */
  quoted: boolean
  /** Contains whitespace inside the value (a wrapped or line-broken paste). */
  innerWhitespace: boolean
  /** Only base64 characters, correct padding, length a multiple of 4. */
  validBase64: boolean
  /** The raw JSON key was pasted instead of its base64 form. */
  looksLikeRawJson: boolean
  /** Decodes, and the result parses as a JSON object. */
  decodesToJson: boolean
  /** The decoded text is itself base64 (encoded twice). */
  doubleEncoded: boolean
  hasPrivateKey: boolean
  /** private_key holds a PEM block ("-----BEGIN PRIVATE KEY-----"). */
  privateKeyIsPem: boolean
  hasClientEmail: boolean
  /** The JSON's "type" is "service_account". */
  isServiceAccount: boolean
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

export function diagnoseServiceAccountKey(value: string | undefined): KeyDiagnostics {
  const raw = value ?? ""
  const trimmed = raw.trim()
  const unquoted = /^(["'])[\s\S]*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed
  const result: KeyDiagnostics = {
    present: trimmed.length > 0,
    length: raw.length,
    trimmedLength: trimmed.length,
    quoted: unquoted !== trimmed,
    innerWhitespace: /\s/.test(trimmed),
    validBase64: trimmed.length > 0 && trimmed.length % 4 === 0 && BASE64.test(trimmed),
    looksLikeRawJson: trimmed.startsWith("{"),
    decodesToJson: false,
    doubleEncoded: false,
    hasPrivateKey: false,
    privateKeyIsPem: false,
    hasClientEmail: false,
    isServiceAccount: false,
  }
  if (!result.present) return result

  // The same decode parseServiceAccountKey does, so the answer matches what it sees.
  const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim()
  result.doubleEncoded = decoded.length > 0 && decoded.length % 4 === 0 && BASE64.test(decoded)
  try {
    const json = JSON.parse(decoded) as unknown
    if (json && typeof json === "object" && !Array.isArray(json)) {
      const record = json as Record<string, unknown>
      result.decodesToJson = true
      result.hasPrivateKey = typeof record.private_key === "string" && record.private_key.length > 0
      result.privateKeyIsPem = typeof record.private_key === "string" && record.private_key.includes("PRIVATE KEY")
      result.hasClientEmail = typeof record.client_email === "string" && record.client_email.includes("@")
      result.isServiceAccount = record.type === "service_account"
    }
  } catch {
    // Not JSON: decodesToJson stays false.
  }
  return result
}
