/** Tests for API key shape, storage hash and how a request carries one (api-keys.ts). */
import { describe, expect, it } from "vitest"
import { apiKeyFromHeaders, generateApiKey, hashApiKey } from "./api-keys"

const headers = (h: Record<string, string>) => new Headers(h)

describe("API keys", () => {
  it("are ak_ and 40 URL-safe characters, stored only as a hash", () => {
    const { key, prefix, hash } = generateApiKey()
    expect(key).toMatch(/^ak_[A-Za-z0-9_-]{40}$/)
    expect(prefix).toBe(key.slice(0, 10))
    expect(hash).toBe(hashApiKey(key))
    expect(hash).not.toContain(key.slice(3))
    expect(generateApiKey().key).not.toBe(key)
  })

  it("are read from a Bearer header or X-API-Key, and only in the right shape", () => {
    const { key } = generateApiKey()
    expect(apiKeyFromHeaders(headers({ authorization: `Bearer ${key}` }))).toBe(key)
    expect(apiKeyFromHeaders(headers({ "x-api-key": key }))).toBe(key)
    expect(apiKeyFromHeaders(headers({ authorization: "Bearer not-a-key" }))).toBeNull()
    expect(apiKeyFromHeaders(headers({ authorization: `Basic ${key}` }))).toBeNull()
    expect(apiKeyFromHeaders(headers({}))).toBeNull()
  })
})
