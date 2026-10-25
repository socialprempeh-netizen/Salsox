/** Tests for webhook secret encryption at rest (secret-box.ts). */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { newWebhookSecret, openSecret, sealSecret } from "./secret-box"

const saved = process.env.AUTH_SECRET
beforeEach(() => {
  process.env.AUTH_SECRET = "test-auth-secret"
})
afterEach(() => {
  process.env.AUTH_SECRET = saved
})

describe("secret box", () => {
  it("round-trips, with a fresh nonce each time", () => {
    const secret = newWebhookSecret()
    expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/)
    const a = sealSecret(secret)
    expect(a).not.toContain(secret)
    expect(sealSecret(secret)).not.toBe(a)
    expect(openSecret(a)).toBe(secret)
  })

  it("cannot be opened with another AUTH_SECRET, or once tampered with", () => {
    const sealed = sealSecret("whsec_abc")
    process.env.AUTH_SECRET = "a-different-secret"
    expect(() => openSecret(sealed)).toThrow()
    process.env.AUTH_SECRET = "test-auth-secret"
    const parts = sealed.split(":")
    parts[3] = Buffer.from("tampered").toString("base64url")
    expect(() => openSecret(parts.join(":"))).toThrow()
  })
})
