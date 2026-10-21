import { describe, expect, it } from "vitest"
import { addressOf, latestReplyText, textFromHtml } from "./inbound"

describe("addressOf", () => {
  it("reads and lowercases the address in either form", () => {
    expect(addressOf("Sam Lee <Sam@Acme.com>")).toBe("sam@acme.com")
    expect(addressOf("sam@acme.com")).toBe("sam@acme.com")
  })

  it("is null when there is no address", () => {
    expect(addressOf("Sam Lee")).toBeNull()
  })
})

describe("latestReplyText", () => {
  it("cuts the quoted thread at 'On ... wrote:'", () => {
    const text = "Please stop emailing me.\n\nOn Tue, 21 Oct 2026 at 09:00, Ama <ama@hello.salsox.com> wrote:\n> Hi Sam, I read your review..."
    expect(latestReplyText(text)).toBe("Please stop emailing me.")
  })

  it("cuts at an Outlook header block and drops > lines", () => {
    expect(latestReplyText("Sounds good, send me a link\n> quoted\n\nFrom: Ama\nSent: Tuesday\nSubject: x")).toBe("Sounds good, send me a link")
  })

  it("reads a reply that is only quoted text whole", () => {
    expect(latestReplyText("> only quoted")).toBe("> only quoted")
  })
})

describe("textFromHtml", () => {
  it("keeps the words and line breaks, drops tags and styles", () => {
    expect(textFromHtml("<style>p{}</style><p>Yes &amp; thanks</p><div>Sam<br>CEO</div>")).toBe("Yes & thanks\nSam\nCEO")
  })
})
