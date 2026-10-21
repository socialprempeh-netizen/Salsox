import { describe, expect, it } from "vitest"
import { composeEmail, domainOf, readUnsubscribeToken, sendingDomainProblem, sentViaLine, unsubscribeSecret, unsubscribeToken } from "./compliance"

describe("domainOf", () => {
  it("reads the domain from either address form", () => {
    expect(domainOf("Salsox <hello@salsox.com>")).toBe("salsox.com")
    expect(domainOf(" Ama@Hello.Salsox.com ")).toBe("hello.salsox.com")
  })

  it("is null for nothing usable", () => {
    expect(domainOf(undefined)).toBeNull()
    expect(domainOf("not-an-address")).toBeNull()
    expect(domainOf("a@localhost")).toBeNull()
  })
})

describe("sendingDomainProblem", () => {
  it("requires an outreach sender", () => {
    expect(sendingDomainProblem(undefined, "a@salsox.com")).toBe("missing")
  })

  it("refuses the product's own sending domain", () => {
    expect(sendingDomainProblem("Ama <ama@salsox.com>", "Salsox <hello@salsox.com>")).toBe("sameDomain")
  })

  it("accepts a subdomain or another domain", () => {
    expect(sendingDomainProblem("Ama <ama@hello.salsox.com>", "Salsox <hello@salsox.com>")).toBeNull()
    expect(sendingDomainProblem("ama@trysalsox.com", undefined)).toBeNull()
  })
})

describe("unsubscribe tokens", () => {
  const secret = "s3cret"

  it("round-trips an address, normalised", () => {
    expect(readUnsubscribeToken(unsubscribeToken(" Sam@Example.com ", secret), secret)).toBe("sam@example.com")
  })

  it("rejects a token made with another secret or tampered with", () => {
    const token = unsubscribeToken("sam@example.com", secret)
    expect(readUnsubscribeToken(token, "other")).toBeNull()
    const forged = `${Buffer.from("boss@example.com").toString("base64url")}.${token.split(".")[1]}`
    expect(readUnsubscribeToken(forged, secret)).toBeNull()
    expect(readUnsubscribeToken("garbage", secret)).toBeNull()
  })

  it("derives the secret from CRON_SECRET unless one is set", () => {
    expect(unsubscribeSecret({})).toBeNull()
    expect(unsubscribeSecret({ OUTREACH_UNSUBSCRIBE_SECRET: "x" })).toBe("x")
    const derived = unsubscribeSecret({ CRON_SECRET: "cron" })
    expect(derived).toMatch(/^[0-9a-f]{64}$/)
    expect(derived).not.toContain("cron")
  })
})

describe("sentViaLine", () => {
  it("is off unless enabled with a tool name", () => {
    expect(sentViaLine({ enabled: false, tool: "Relay" })).toBeNull()
    expect(sentViaLine({ enabled: true, tool: " " })).toBeNull()
    expect(sentViaLine({ enabled: true, tool: "Relay" })).toBe("Sent via Relay")
    expect(sentViaLine({ enabled: true, tool: "Relay", url: "https://relay.example" })).toBe("Sent via Relay (https://relay.example)")
  })
})

describe("composeEmail", () => {
  it("puts the sent-via line before the footer only when given", () => {
    expect(composeEmail({ body: "Hi\n", sentVia: null, footer: ["Addr", "Unsub"] })).toBe("Hi\n\n--\nAddr\nUnsub")
    expect(composeEmail({ body: "Hi", sentVia: "Sent via Relay", footer: ["Addr"] })).toBe("Hi\n\nSent via Relay\n\n--\nAddr")
  })
})
