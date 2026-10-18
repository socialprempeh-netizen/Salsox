/**
 * Tests for ga-data.ts: the JWT a service account signs to get a GA access
 * token is well formed and verifies against the account's public key, and
 * the page reports what is missing instead of calling Google half set up.
 */
import { generateKeyPairSync, createVerify } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: <T>(fn: T) => fn }))

import { jwtAssertion, trafficReport } from "./ga-data"
import { resolveRange } from "./traffic"

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
const key = { clientEmail: "ga@proj.iam.gserviceaccount.com", privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(), tokenUri: "https://oauth2.googleapis.com/token" }

afterEach(() => vi.unstubAllEnvs())

describe("jwtAssertion", () => {
  it("is an RS256 JWT for the read-only Analytics scope, valid one hour", () => {
    const now = Date.UTC(2026, 9, 18)
    const jwt = jwtAssertion(key, now)
    const [header, claims, signature] = jwt.split(".")
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" })
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: key.clientEmail,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: key.tokenUri,
      iat: now / 1000,
      exp: now / 1000 + 3600,
    })
    const verified = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url"))
    expect(verified).toBe(true)
  })
})

describe("trafficReport", () => {
  it("names what is missing and calls nothing when not configured", async () => {
    vi.stubEnv("GA_SERVICE_ACCOUNT_KEY_BASE64", "")
    vi.stubEnv("GA4_PROPERTY_ID", "")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    expect(await trafficReport(resolveRange({}))).toEqual({ state: "notConfigured", missing: ["key", "property"] })
    vi.stubEnv("GA4_PROPERTY_ID", "123456789")
    expect(await trafficReport(resolveRange({}))).toEqual({ state: "notConfigured", missing: ["key"] })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it("reports a bad key as an error without echoing it", async () => {
    vi.stubEnv("GA_SERVICE_ACCOUNT_KEY_BASE64", "c2VjcmV0LXZhbHVl")
    vi.stubEnv("GA4_PROPERTY_ID", "123456789")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const report = await trafficReport(resolveRange({}))
    expect(report.state).toBe("error")
    expect(JSON.stringify(report)).not.toContain("c2VjcmV0LXZhbHVl")
    expect(JSON.stringify(report)).not.toContain("secret-value")
  })
})
