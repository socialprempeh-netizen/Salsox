/**
 * Tests for the zod-free email helpers (email-list.ts): the pattern is
 * exactly zod's, and the browser's check agrees with the server's on every
 * address, valid or not.
 */
import { describe, expect, it } from "vitest"
import { z } from "zod"
import { regexes } from "zod/v4/core"
import { EMAIL_PATTERN, parseEmailList } from "./email-list"

describe("EMAIL_PATTERN", () => {
  it("is zod's own email pattern, so the form and the server cannot drift apart", () => {
    expect(EMAIL_PATTERN.source).toBe(regexes.email.source)
    expect(EMAIL_PATTERN.flags).toBe(regexes.email.flags)
  })

  it("agrees with z.email() on valid and invalid addresses", () => {
    const samples = [
      "ama@x.com", "kofi.boateng@example.co.uk", "a+tag@b.io", "o'neil@x.ie", "x_y-z@sub.domain.org",
      "nope", "a@b", "a@b.c", "@x.com", "a..b@x.com", ".a@x.com", "a.@x.com", "a@-x.com", "a b@x.com", "a@x..com", "",
    ]
    for (const s of samples) expect(EMAIL_PATTERN.test(s)).toBe(z.email().safeParse(s).success)
  })
})

describe("parseEmailList", () => {
  it("behaves as it did inside schemas.ts", () => {
    const { emails, invalid } = parseEmailList('ama@x.com; Kofi <KOFI@y.com>\n"Esi A" <esi@z.com>, ama@x.com, nope')
    expect(emails).toEqual([{ email: "ama@x.com" }, { email: "kofi@y.com", name: "Kofi" }, { email: "esi@z.com", name: "Esi A" }])
    expect(invalid).toEqual(["nope"])
  })
})
