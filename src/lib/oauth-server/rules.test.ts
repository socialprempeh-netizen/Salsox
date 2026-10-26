/**
 * Tests for the OAuth server's rules (rules.ts): clients only from the
 * environment, authorize requests that cannot be turned into an open
 * redirect, PKCE, token shapes, client authentication and scopes.
 */
import { describe, expect, it } from "vitest"
import {
  authenticateClient,
  authorizeRedirect,
  bearerAccessToken,
  checkAuthorizeRequest,
  generateToken,
  isToken,
  OAUTH_SCOPES,
  oauthClients,
  parseScopes,
  pkceMatches,
  resumablePath,
  scopeAllows,
} from "./rules"

const secret = "s".repeat(40)
const env = { OAUTH_CLIENT_ID: "sf-package", OAUTH_CLIENT_SECRET: secret, OAUTH_REDIRECT_URIS: "https://login.salesforce.com/services/authcallback/Salsox, http://insecure.example/cb" }
const clients = oauthClients(env)
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const good = { client_id: "sf-package", redirect_uri: "https://login.salesforce.com/services/authcallback/Salsox", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", scope: "documents:send documents:read", state: "xyz" }

describe("clients", () => {
  it("come only from the environment, with https redirect addresses and a long secret", () => {
    expect(clients).toEqual([{ id: "sf-package", secret, name: "Salesforce", redirectUris: ["https://login.salesforce.com/services/authcallback/Salsox"] }])
    expect(oauthClients({})).toEqual([])
    expect(oauthClients({ ...env, OAUTH_CLIENT_SECRET: "short" })).toEqual([])
  })
})

describe("authorize requests", () => {
  it("accepts a complete request", () => {
    const result = checkAuthorizeRequest(good, clients)
    expect(result.ok && result.request.scopes).toEqual(["documents:send", "documents:read"])
  })

  it("never redirects for an unknown client or an unregistered address", () => {
    expect(checkAuthorizeRequest({ ...good, client_id: "other" }, clients)).toEqual({ ok: false, error: "unknown_client" })
    expect(checkAuthorizeRequest({ ...good, redirect_uri: "https://attacker.example/cb" }, clients)).toEqual({ ok: false, error: "bad_redirect" })
    expect(checkAuthorizeRequest({ ...good, redirect_uri: "https://login.salesforce.com/services/authcallback/Salsox/extra" }, clients)).toEqual({ ok: false, error: "bad_redirect" })
  })

  it("sends other faults back to the client, PKCE included", () => {
    expect(checkAuthorizeRequest({ ...good, response_type: "token" }, clients)).toMatchObject({ ok: false, error: "unsupported_response_type", state: "xyz" })
    expect(checkAuthorizeRequest({ ...good, code_challenge_method: "plain" }, clients)).toMatchObject({ ok: false, error: "invalid_request" })
    expect(checkAuthorizeRequest({ ...good, code_challenge: undefined }, clients)).toMatchObject({ ok: false, error: "invalid_request" })
    expect(checkAuthorizeRequest({ ...good, scope: "documents:delete" }, clients)).toMatchObject({ ok: false, error: "invalid_scope" })
  })

  it("adds the outcome and the state to the client's address", () => {
    expect(authorizeRedirect("https://x.example/cb?a=1", { code: "c1" }, "st")).toBe("https://x.example/cb?a=1&code=c1&state=st")
    expect(authorizeRedirect("https://x.example/cb", { error: "access_denied" }, null)).toBe("https://x.example/cb?error=access_denied")
  })
})

describe("scopes", () => {
  it("defaults to all, and refuses an unknown one", () => {
    expect(parseScopes(undefined)).toEqual([...OAUTH_SCOPES])
    expect(parseScopes("templates:read+documents:read")).toEqual(["documents:read", "templates:read"])
    expect(parseScopes("admin")).toBeNull()
  })

  it("lets API keys use every route, and tokens only their scopes", () => {
    expect(scopeAllows(undefined, "documents:send")).toBe(true)
    expect(scopeAllows(["documents:read"], "documents:read")).toBe(true)
    expect(scopeAllows(["documents:read"], "documents:send")).toBe(false)
    expect(scopeAllows(["documents:read"], null)).toBe(true)
  })
})

describe("tokens and PKCE", () => {
  it("have their own shapes", () => {
    const access = generateToken("access")
    expect(isToken("access", access)).toBe(true)
    expect(isToken("refresh", access)).toBe(false)
    expect(bearerAccessToken(new Headers({ authorization: `Bearer ${access}` }))).toBe(access)
    expect(bearerAccessToken(new Headers({ authorization: "Bearer ak_notanoauthtoken" }))).toBeNull()
  })

  it("checks the verifier against the challenge", () => {
    expect(pkceMatches(verifier, challenge)).toBe(true)
    expect(pkceMatches(`${verifier}x`, challenge)).toBe(false)
    expect(pkceMatches("short", challenge)).toBe(false)
  })
})

describe("client authentication", () => {
  it("takes HTTP Basic or the body, and refuses a wrong secret", () => {
    const basic = new Headers({ authorization: `Basic ${Buffer.from(`sf-package:${secret}`).toString("base64")}` })
    expect(authenticateClient(basic, new URLSearchParams(), clients)?.id).toBe("sf-package")
    expect(authenticateClient(new Headers(), new URLSearchParams({ client_id: "sf-package", client_secret: secret }), clients)?.id).toBe("sf-package")
    expect(authenticateClient(new Headers(), new URLSearchParams({ client_id: "sf-package", client_secret: "wrong" }), clients)).toBeNull()
    expect(authenticateClient(new Headers(), new URLSearchParams({ client_id: "sf-package" }), clients)).toBeNull()
  })
})

describe("resuming after sign-in", () => {
  it("returns only to the consent page", () => {
    expect(resumablePath("/oauth/authorize?client_id=x")).toBe("/oauth/authorize?client_id=x")
    expect(resumablePath("https://attacker.example/oauth/authorize?")).toBeNull()
    expect(resumablePath("//attacker.example")).toBeNull()
    expect(resumablePath("/dashboard")).toBeNull()
  })
})
