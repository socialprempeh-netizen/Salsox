import { describe, expect, it } from "vitest"
import { isPlausibleToken, newSigningToken } from "./tokens"

describe("signing tokens", () => {
  it("issues unique, well-formed tokens", () => {
    const a = newSigningToken()
    const b = newSigningToken()
    expect(a).not.toBe(b)
    expect(isPlausibleToken(a)).toBe(true)
  })
  it("rejects malformed tokens before any lookup", () => {
    expect(isPlausibleToken("short")).toBe(false)
    expect(isPlausibleToken("../../../../etc/passwd-aaaaaaaaaaaa")).toBe(false)
  })
})
