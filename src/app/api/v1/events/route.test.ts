/**
 * Tests for GET /api/v1/events: a key is required, the event and limit are
 * checked, and the account's recent events come back as a plain array (the
 * shape Zapier's perform list expects), empty when there are none.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authenticate = vi.fn()
const recentEvents = vi.fn()

vi.mock("@/lib/api-keys-store", () => ({ authenticateApiRequest: (...a: unknown[]) => authenticate(...a) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }))
vi.mock("@/lib/webhooks/store", () => ({ RECENT_EVENTS_MAX: 100, recentEvents: (...a: unknown[]) => recentEvents(...a) }))

const { GET } = await import("./route")
const get = (query: string) => new Request(`https://app.example.com/api/v1/events${query}`, { headers: { authorization: "Bearer ak_x" } })

beforeEach(() => {
  vi.resetAllMocks()
  authenticate.mockResolvedValue({ keyId: "k1", userId: "u1", email: "a@example.com", name: "A" })
})

describe("GET /api/v1/events", () => {
  it("answers 401 without a valid key", async () => {
    authenticate.mockResolvedValue(null)
    expect((await GET(get("?event=document.sent"))).status).toBe(401)
  })

  it("returns the account's recent events as an array, three by default", async () => {
    recentEvents.mockResolvedValue([{ id: "evt_a_1", event: "document.completed" }])
    const res = await GET(get("?event=document.completed"))
    expect(await res.json()).toEqual([{ id: "evt_a_1", event: "document.completed" }])
    expect(recentEvents).toHaveBeenCalledWith("u1", "document.completed", 3)
  })

  it("returns an empty array when nothing has happened yet", async () => {
    recentEvents.mockResolvedValue([])
    expect(await (await GET(get("?event=payment.sent&limit=100"))).json()).toEqual([])
    expect(recentEvents).toHaveBeenCalledWith("u1", "payment.sent", 100)
  })

  it("refuses an unknown event or a bad limit", async () => {
    expect((await GET(get("?event=document.deleted"))).status).toBe(422)
    expect((await GET(get("?event=document.sent&limit=101"))).status).toBe(422)
    expect((await GET(get("?event=document.sent&limit=0"))).status).toBe(422)
    expect(recentEvents).not.toHaveBeenCalled()
  })
})
