/**
 * The outreach sending address and where replies go: an address on the
 * verified subdomain passes, the product's own domain does not, replies may
 * go to the main inbox (then they are logged by hand), and a reply-to that
 * is not an address is reported.
 */
import { describe, expect, it } from "vitest"
import { replyRoute, sendingDomainProblem, suggestedSendingDomain } from "./compliance"

describe("sending from a subdomain", () => {
  it("accepts an address on the subdomain and refuses the product's own domain", () => {
    expect(sendingDomainProblem("Richard at Example <richard@hello.example.com>", "Example <contact@example.com>")).toBeNull()
    expect(sendingDomainProblem("contact@example.com", "Example <noreply@example.com>")).toBe("sameDomain")
  })

  it("suggests hello. on the product's own email domain", () => {
    expect(suggestedSendingDomain("Example <noreply@example.com>")).toBe("hello.example.com")
    expect(suggestedSendingDomain(undefined)).toBeNull()
  })
})

describe("replyRoute", () => {
  const from = "Richard at Example <richard@hello.example.com>"

  it("sends replies to the main inbox when OUTREACH_REPLY_TO says so, outside the inbound domain", () => {
    expect(replyRoute("contact@example.com", from)).toEqual({ address: "contact@example.com", inbound: false })
  })

  it("keeps replies on the outreach domain when it is not set", () => {
    expect(replyRoute(undefined, from)).toEqual({ address: "richard@hello.example.com", inbound: true })
    expect(replyRoute("replies@hello.example.com", from)).toEqual({ address: "replies@hello.example.com", inbound: true })
  })

  it("reports a reply-to that is not an address", () => {
    expect(replyRoute("contact", from)).toBe("invalid")
    expect(replyRoute(undefined, undefined)).toBeNull()
  })
})
