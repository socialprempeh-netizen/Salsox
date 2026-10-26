/**
 * Tests for the integration OAuth state (oauth-state.ts): a callback is
 * accepted only with a state Salsox signed, unedited, unexpired, for the same
 * provider and user, in the browser that started the flow.
 */
import { describe, expect, it } from "vitest"
import { checkState, createState, pkceChallenge, pkcePair, readStateCookie, stateCookieValue, STATE_TTL_MS } from "./oauth-state"

const secret = "test-secret"
const now = 1_800_000_000_000

describe("OAuth state", () => {
  const { state, nonce } = createState({ provider: "hubspot", userId: "u1", secret, now, extra: { sandbox: true } })
  const check = (over: Partial<Parameters<typeof checkState>[0]> = {}) => checkState({ state, provider: "hubspot", userId: "u1", cookieNonce: nonce, secret, now: now + 1000, ...over })

  it("accepts its own state, and carries what the flow needs", () => {
    const result = check()
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.payload.x).toEqual({ sandbox: true })
  })

  it("refuses an edited or foreign state", () => {
    const [data, sig] = state.split(".")
    const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(data, "base64url").toString()), u: "u2" })).toString("base64url")
    expect(check({ state: `${edited}.${sig}` })).toEqual({ ok: false, reason: "signature" })
    expect(check({ secret: "another-secret" })).toEqual({ ok: false, reason: "signature" })
    expect(check({ state: "nonsense" })).toEqual({ ok: false, reason: "malformed" })
    expect(check({ state: 42 })).toEqual({ ok: false, reason: "malformed" })
  })

  it("refuses it late, for another provider or user, or in another browser", () => {
    expect(check({ now: now + STATE_TTL_MS + 1 })).toEqual({ ok: false, reason: "expired" })
    expect(check({ provider: "salesforce" })).toEqual({ ok: false, reason: "provider" })
    expect(check({ userId: "u2" })).toEqual({ ok: false, reason: "user" })
    expect(check({ cookieNonce: null })).toEqual({ ok: false, reason: "browser" })
    expect(check({ cookieNonce: "other" })).toEqual({ ok: false, reason: "browser" })
  })
})

describe("state cookie and PKCE", () => {
  it("keeps the verifier beside the nonce, out of any URL", () => {
    expect(readStateCookie(stateCookieValue("n1", "v1"))).toEqual({ nonce: "n1", verifier: "v1" })
    expect(readStateCookie(stateCookieValue("n1"))).toEqual({ nonce: "n1", verifier: null })
    expect(readStateCookie(undefined)).toEqual({ nonce: null, verifier: null })
  })

  it("makes S256 pairs (RFC 7636 appendix B)", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
    const pair = pkcePair()
    expect(pkceChallenge(pair.verifier)).toBe(pair.challenge)
    expect(pair.verifier.length).toBeGreaterThanOrEqual(43)
  })
})
