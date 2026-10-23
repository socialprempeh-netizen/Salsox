import { describe, expect, it } from "vitest"
import { oauth1Header, percentEncode, signatureBaseString } from "./oauth1"

// X's own worked example of signing a request ("Creating a signature" in its
// OAuth 1.0a documentation). These are the documentation's sample
// credentials, not real ones.
const example = {
  method: "POST",
  url: "https://api.twitter.com/1.1/statuses/update.json?include_entities=true",
  formParams: { status: "Hello Ladies + Gentlemen, a signed OAuth request!" },
  credentials: {
    consumerKey: "xvz1evFS4wEEPTGEFPHBog",
    consumerSecret: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
    token: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
    tokenSecret: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
  },
  nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
  timestamp: "1318622958",
}

describe("percentEncode", () => {
  it("encodes the characters encodeURIComponent leaves alone", () => {
    expect(percentEncode("Ladies + Gentlemen!*'()")).toBe("Ladies%20%2B%20Gentlemen%21%2A%27%28%29")
    expect(percentEncode("a-b_c.d~e")).toBe("a-b_c.d~e")
  })
})

describe("OAuth 1.0a signing", () => {
  it("builds the documented signature base string", () => {
    const base = signatureBaseString(example.method, example.url, {
      ...example.formParams,
      oauth_consumer_key: example.credentials.consumerKey,
      oauth_nonce: example.nonce,
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: example.timestamp,
      oauth_token: example.credentials.token,
      oauth_version: "1.0",
    })
    expect(base.startsWith("POST&https%3A%2F%2Fapi.twitter.com%2F1.1%2Fstatuses%2Fupdate.json&include_entities%3Dtrue%26oauth_consumer_key%3Dxvz1evFS4wEEPTGEFPHBog")).toBe(true)
    expect(base.endsWith("status%3DHello%2520Ladies%2520%252B%2520Gentlemen%252C%2520a%2520signed%2520OAuth%2520request%2521")).toBe(true)
  })

  it("produces the documented signature in the header", async () => {
    const header = await oauth1Header({ method: example.method, url: example.url, formParams: example.formParams }, example.credentials, { nonce: example.nonce, timestamp: example.timestamp })
    expect(header).toContain(`oauth_signature="${percentEncode("hCtSmYh+iHYCEqBWrE7C7hYmtUk=")}"`)
    expect(header.startsWith("OAuth oauth_consumer_key=")).toBe(true)
  })

  it("uses a fresh nonce and the current time by default", async () => {
    const a = await oauth1Header({ method: "POST", url: "https://api.x.com/2/tweets" }, example.credentials)
    const b = await oauth1Header({ method: "POST", url: "https://api.x.com/2/tweets" }, example.credentials)
    expect(a).not.toBe(b)
    expect(a).toMatch(/oauth_timestamp="\d{10}"/)
  })
})
