import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"

/**
 * The AppSumo webhook's gate, with real signatures: a forged, stale or
 * malformed request must never reach the license writes behind it, a test
 * request is acknowledged without being applied, and a signed event is
 * answered the way AppSumo expects (`{ event, success: true }`).
 */

const API_KEY = "test-appsumo-api-key"
const storeMock = { applyAppSumoEvent: vi.fn() }
vi.mock("@/lib/appsumo-store", () => storeMock)

const { POST } = await import("./route")

const original = { ...process.env }

function request(body: object | string, opts: { key?: string; timestamp?: string; signature?: string } = {}) {
  const raw = typeof body === "string" ? body : JSON.stringify(body)
  const timestamp = opts.timestamp ?? String(Date.now())
  const signature = opts.signature ?? createHmac("sha256", opts.key ?? API_KEY).update(timestamp + raw).digest("hex")
  return new Request("http://localhost/api/webhooks/appsumo", {
    method: "POST",
    headers: { "content-type": "application/json", "x-appsumo-timestamp": timestamp, "x-appsumo-signature": signature },
    body: raw,
  })
}

const refund = {
  license_key: "3794577c-3dbc-11ec-9bbc-0242ac130002",
  event: "deactivate",
  event_timestamp: 1671586388077,
  created_at: 1671586388072,
  license_status: "deactivated",
  tier: 1,
  test: false,
  extra: { reason: "Refunded by the customer" },
}

describe("POST /api/webhooks/appsumo", () => {
  beforeEach(() => {
    process.env.APPSUMO_API_KEY = API_KEY
    storeMock.applyAppSumoEvent.mockReset().mockResolvedValue("applied")
  })
  afterEach(() => {
    process.env = { ...original }
  })

  it("applies a signed refund and answers success", async () => {
    const res = await POST(request(refund))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ event: "deactivate", success: true })
    expect(storeMock.applyAppSumoEvent).toHaveBeenCalledWith(expect.objectContaining({ event: "deactivate", licenseKey: refund.license_key, reason: "Refunded by the customer" }))
  })

  it("refuses a request signed with another key, or stale", async () => {
    expect((await POST(request(refund, { key: "wrong" }))).status).toBe(401)
    expect((await POST(request(refund, { timestamp: String(Date.now() - 60 * 60_000) }))).status).toBe(401)
    expect((await POST(request(refund, { signature: "" }))).status).toBe(401)
    expect(storeMock.applyAppSumoEvent).not.toHaveBeenCalled()
  })

  it("acknowledges a test request without applying it", async () => {
    const res = await POST(request({ event: "upgrade", test: true }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ event: "upgrade", success: true })
    expect(storeMock.applyAppSumoEvent).not.toHaveBeenCalled()
  })

  it("answers 400 to signed nonsense and 500 when recording fails, so AppSumo retries", async () => {
    expect((await POST(request("not json"))).status).toBe(400)
    expect((await POST(request({ event: "refund", license_key: refund.license_key }))).status).toBe(400)
    storeMock.applyAppSumoEvent.mockRejectedValueOnce(new Error("db down"))
    expect((await POST(request(refund))).status).toBe(500)
  })

  it("is off without an API key", async () => {
    delete process.env.APPSUMO_API_KEY
    expect((await POST(request(refund))).status).toBe(503)
  })
})
