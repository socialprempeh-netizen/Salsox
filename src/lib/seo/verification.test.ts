import { describe, expect, it } from "vitest"
import { siteVerification, verificationCode } from "./verification"

describe("verificationCode", () => {
  it("takes the code as given", () => {
    expect(verificationCode(" abcDEF123_-xyz ")).toBe("abcDEF123_-xyz")
  })

  it("takes the code out of a pasted meta tag", () => {
    expect(verificationCode('<meta name="google-site-verification" content="abcDEF123_-xyz" />')).toBe("abcDEF123_-xyz")
    expect(verificationCode("<meta name='msvalidate.01' content='0123456789ABCDEF0123456789ABCDEF'>")).toBe("0123456789ABCDEF0123456789ABCDEF")
  })

  it("renders nothing for an empty or malformed value", () => {
    expect(verificationCode("")).toBeNull()
    expect(verificationCode(undefined)).toBeNull()
    expect(verificationCode("<meta name=\"x\">")).toBeNull()
  })
})

describe("siteVerification", () => {
  it("renders only the tags that are set", () => {
    expect(siteVerification({})).toEqual({})
    expect(siteVerification({ GOOGLE_SITE_VERIFICATION: "g123", BING_SITE_VERIFICATION: '<meta name="msvalidate.01" content="B456" />' })).toEqual({ google: "g123", other: { "msvalidate.01": "B456" } })
  })
})
