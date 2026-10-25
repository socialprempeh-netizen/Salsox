/**
 * Tests for the public webhook subscription API (/api/v1/webhooks and
 * /api/v1/webhooks/{id}): a key is required, Zapier's REST-hook body shape
 * is accepted, refusals come back as JSON errors with a code, and an
 * endpoint of another account is a 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authenticate = vi.fn()
const createEndpoint = vi.fn()
const listEndpoints = vi.fn()
const deleteEndpoint = vi.fn()

vi.mock("@/lib/api-keys-store", () => ({ authenticateApiRequest: (...a: unknown[]) => authenticate(...a) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }))
vi.mock("@/lib/webhooks/store", () => ({
  createEndpoint: (...a: unknown[]) => createEndpoint(...a),
  listEndpoints: (...a: unknown[]) => listEndpoints(...a),
  deleteEndpoint: (...a: unknown[]) => deleteEndpoint(...a),
}))

const { GET, POST } = await import("./route")
const { DELETE } = await import("./[id]/route")

const req = (method: string, body?: unknown) =>
  new Request("https://app.example.com/api/v1/webhooks", { method, headers: { authorization: "Bearer ak_x", "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })

beforeEach(() => {
  vi.resetAllMocks()
  authenticate.mockResolvedValue({ keyId: "k1", userId: "u1", email: "a@example.com", name: "A" })
})

describe("/api/v1/webhooks", () => {
  it("answers 401 without a valid key", async () => {
    authenticate.mockResolvedValue(null)
    const res = await GET(req("GET"))
    expect(res.status).toBe(401)
    expect((await res.json()).error.code).toBe("unauthorized")
  })

  it("subscribes with Zapier's target_url and event, and returns the secret once", async () => {
    createEndpoint.mockResolvedValue({ ok: true, id: "w1", url: "https://hooks.zapier.com/x", events: ["document.completed"], secret: "whsec_s" })
    const res = await POST(req("POST", { target_url: "https://hooks.zapier.com/x", event: "document.completed" }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: "w1", url: "https://hooks.zapier.com/x", events: ["document.completed"], secret: "whsec_s" })
    expect(createEndpoint).toHaveBeenCalledWith("u1", { url: "https://hooks.zapier.com/x", events: ["document.completed"], description: null, source: "api" })
  })

  it("refuses a bad URL or body with a code", async () => {
    createEndpoint.mockResolvedValue({ ok: false, error: "private" })
    const res = await POST(req("POST", { url: "https://10.0.0.1/x", events: ["document.sent"] }))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("private")
    const bad = await POST(new Request("https://app.example.com/api/v1/webhooks", { method: "POST", headers: { authorization: "Bearer ak_x" }, body: "not json" }))
    expect(bad.status).toBe(400)
  })

  it("lists without secrets", async () => {
    listEndpoints.mockResolvedValue([{ id: "w1", url: "https://x", events: ["document.sent"], enabled: true, source: "api", createdAt: new Date("2026-10-25T00:00:00Z"), deliveries: [] }])
    const body = await (await GET(req("GET"))).json()
    expect(body.data).toEqual([{ id: "w1", url: "https://x", events: ["document.sent"], enabled: true, source: "api", created_at: "2026-10-25T00:00:00.000Z" }])
    expect(JSON.stringify(body)).not.toContain("secret")
  })

  it("unsubscribes its own endpoint, and 404s anyone else's", async () => {
    deleteEndpoint.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    expect((await DELETE(req("DELETE"), { params: Promise.resolve({ id: "w1" }) })).status).toBe(204)
    expect((await DELETE(req("DELETE"), { params: Promise.resolve({ id: "other" }) })).status).toBe(404)
    expect(deleteEndpoint).toHaveBeenCalledWith("u1", "other")
  })
})
