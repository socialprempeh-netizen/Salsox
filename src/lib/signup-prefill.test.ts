/**
 * Tests for the signup email prefill (signup-prefill.ts): a plain address is
 * passed through trimmed, and anything else (missing, repeated, oversized,
 * not an address, markup) leaves the field empty.
 */
import { describe, expect, it } from "vitest"
import { MAX_EMAIL_LENGTH, prefillEmail } from "./signup-prefill"

describe("prefillEmail", () => {
  it("passes a plain address through, trimmed", () => {
    expect(prefillEmail("  ama@example.com ")).toBe("ama@example.com")
    expect(prefillEmail("ama.mensah+docs@studio.co.gh")).toBe("ama.mensah+docs@studio.co.gh")
  })

  it("ignores anything that is not one plain address", () => {
    for (const value of [undefined, null, 42, ["a@b.co", "c@d.co"], "", "   ", "ama", "ama@example", "@example.com", "a b@example.com", 'x"@y.co', "<script>@x.co"]) {
      expect(prefillEmail(value), String(value)).toBeUndefined()
    }
  })

  it("ignores an address longer than an email can be", () => {
    const long = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.com`
    expect(prefillEmail(long)).toBeUndefined()
  })
})
