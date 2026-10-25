/**
 * Personal API keys, as pure rules: their shape, how they are stored, and how
 * a request carries one. The database side is api-keys-store.ts; the API
 * routes that accept them are under src/app/api/v1.
 *
 * A key is "ak_" and 40 random URL-safe characters (240 bits). Only its
 * SHA-256 is stored, so a copy of the database cannot be used to call the
 * API; the key is shown once, when it is created. Its first characters are
 * kept apart ("prefix") so a list of keys can say which is which.
 *
 * A request sends it as `Authorization: Bearer ak_…` or `X-API-Key: ak_…`,
 * the two forms integration platforms offer for API-key authentication.
 */
import { createHash, randomBytes } from "node:crypto"

const SHAPE = /^ak_[A-Za-z0-9_-]{40}$/

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `ak_${randomBytes(30).toString("base64url")}`
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) }
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

/** The key a request carries, or null when it carries none in the right shape. */
export function apiKeyFromHeaders(headers: { get(name: string): string | null }): string | null {
  const bearer = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]
  const key = bearer ?? headers.get("x-api-key")?.trim() ?? null
  return key && SHAPE.test(key) ? key : null
}
