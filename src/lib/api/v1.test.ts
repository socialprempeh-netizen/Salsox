/**
 * Tests for the API's caller check (v1.ts): an API key may use every route,
 * an OAuth access token only the routes its grant's scopes cover, and a
 * request with neither is a 401.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authenticateApiRequest = vi.fn()
const authenticateOAuthToken = vi.fn()

vi.mock("@/lib/api-keys-store", () => ({ authenticateApiRequest: (...a: unknown[]) => authenticateApiRequest(...a) }))
vi.mock("@/lib/oauth-server/store", () => ({ authenticateOAuthToken: (...a: unknown[]) => authenticateOAuthToken(...a) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }))

const { withApiKey, withScope } = await import("./v1")

const oauthToken = `sxo_at_${"a".repeat(40)}`
const request = (auth: string) => new Request("https://app.example.com/api/v1/x", { headers: { authorization: auth } })
const ok = async () => new Response("ok")

beforeEach(() => {
  vi.clearAllMocks()
  authenticateApiRequest.mockResolvedValue({ keyId: "k1", userId: "u1", email: "a@example.com", name: null })
  authenticateOAuthToken.mockResolvedValue({ keyId: "oauth:g1", grantId: "g1", userId: "u1", email: "a@example.com", name: null, scopes: ["documents:read"] })
})

describe("withScope", () => {
  it("lets an API key use any route", async () => {
    const res = await withScope("documents:send", request(`Bearer ak_${"b".repeat(40)}`), ok)
    expect(res.status).toBe(200)
    expect(authenticateOAuthToken).not.toHaveBeenCalled()
  })

  it("holds an OAuth token to its scopes", async () => {
    expect((await withScope("documents:read", request(`Bearer ${oauthToken}`), ok)).status).toBe(200)
    const refused = await withScope("documents:send", request(`Bearer ${oauthToken}`), ok)
    expect(refused.status).toBe(403)
    expect((await refused.json()).error.code).toBe("insufficient_scope")
    expect(authenticateApiRequest).not.toHaveBeenCalled()
  })

  it("answers 401 for a token that is not valid", async () => {
    authenticateOAuthToken.mockResolvedValue(null)
    expect((await withApiKey(request(`Bearer ${oauthToken}`), ok)).status).toBe(401)
  })
})
