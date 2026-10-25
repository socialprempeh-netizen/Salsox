/**
 * Tests for GET /api/v1/me (the account, and its plan as sending applies it)
 * and DELETE /api/v1/keys/current (the caller revoking its own key, which
 * the Salsox Signing extension's "Disconnect" calls).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authenticate = vi.fn()
const senderPlan = vi.fn()
const revokeApiKey = vi.fn()

vi.mock("@/lib/api-keys-store", () => ({
  authenticateApiRequest: (...a: unknown[]) => authenticate(...a),
  revokeApiKey: (...a: unknown[]) => revokeApiKey(...a),
}))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }))
vi.mock("@/lib/esign/sender", () => ({ senderPlan: (...a: unknown[]) => senderPlan(...a) }))

const { GET } = await import("./route")
const { DELETE } = await import("../keys/current/route")
const req = (method = "GET") => new Request("https://app.example.com/api/v1/me", { method, headers: { authorization: "Bearer ak_x" } })

beforeEach(() => {
  vi.resetAllMocks()
  authenticate.mockResolvedValue({ keyId: "k1", userId: "u1", email: "a@example.com", name: "A" })
})

describe("GET /api/v1/me", () => {
  it("names the account and states a free plan's allowance and features", async () => {
    senderPlan.mockResolvedValue({ tier: "free", documentsLeft: 2 })
    expect(await (await GET(req())).json()).toEqual({
      id: "u1",
      email: "a@example.com",
      name: "A",
      plan: { tier: "free", documents_left: 2, documents_per_month: 3, features: { sequential_signing: false, sign_and_pay: false, approvers: false } },
    })
  })

  it("has no allowance on an unlimited plan", async () => {
    senderPlan.mockResolvedValue({ tier: "business", documentsLeft: null })
    const { plan } = await (await GET(req())).json()
    expect(plan).toEqual({ tier: "business", documents_left: null, documents_per_month: null, features: { sequential_signing: true, sign_and_pay: true, approvers: true } })
  })
})

describe("DELETE /api/v1/keys/current", () => {
  it("revokes the key the request is made with, and nothing else", async () => {
    const res = await DELETE(req("DELETE"))
    expect(res.status).toBe(204)
    expect(revokeApiKey).toHaveBeenCalledWith("u1", "k1")
  })

  it("answers 401 without a valid key", async () => {
    authenticate.mockResolvedValue(null)
    expect((await DELETE(req("DELETE"))).status).toBe(401)
    expect(revokeApiKey).not.toHaveBeenCalled()
  })
})
