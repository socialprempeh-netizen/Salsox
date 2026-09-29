import { describe, expect, it } from "vitest"
import { mailtoShareUrl, shareMessage, signingUrl, smsShareUrl, whatsappShareUrl } from "./share"

describe("share links", () => {
  it("builds the signing URL without double slashes", () => {
    expect(signingUrl("https://app.example.com/", "abc")).toBe("https://app.example.com/sign/abc")
  })

  it("names the sender when known", () => {
    expect(shareMessage("NDA", "https://x/sign/t", "Ama")).toBe('Ama sent you "NDA" to sign: https://x/sign/t')
    expect(shareMessage("NDA", "https://x/sign/t")).toBe('You have "NDA" to sign: https://x/sign/t')
  })

  it("strips a phone number to digits for WhatsApp", () => {
    expect(whatsappShareUrl("hi there", "+233 20-123 4567")).toBe("https://wa.me/233201234567?text=hi%20there")
    expect(whatsappShareUrl("hi")).toBe("https://wa.me/?text=hi")
  })

  it("uses the cross-platform sms body form", () => {
    expect(smsShareUrl("a&b", "+233 20 123")).toBe("sms:+23320123?&body=a%26b")
  })

  it("encodes mailto parts", () => {
    expect(mailtoShareUrl("a@b.co", "Sign", "x y")).toBe("mailto:a%40b.co?subject=Sign&body=x%20y")
  })
})
