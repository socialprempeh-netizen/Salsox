import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// The sitemap reads content from disk; here it is fixed, so these tests are
// about what the endpoint does with it. The protocol rules have their own
// tests in src/lib/indexnow.test.ts.
const entries = vi.hoisted(() => ({
  current: [] as { url: string; lastModified?: Date }[],
}))
vi.mock("@/app/sitemap", () => ({ default: () => entries.current }))
vi.mock("@/config/site", () => ({ siteConfig: { url: "https://salsox.com" } }))

import { GET, POST } from "./route"

const original = { ...process.env }
const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))

const request = (method: string, body?: unknown, auth = "Bearer cron") =>
  new Request("https://salsox.com/api/indexnow", {
    method,
    headers: { authorization: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const sentUrls = () =>
  fetchMock.mock.calls.flatMap((call) => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).urlList)

beforeEach(() => {
  process.env.CRON_SECRET = "cron"
  delete process.env.DEMO_MODE
  delete process.env.INDEXNOW_KEY
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockClear()
  entries.current = [
    { url: "https://salsox.com/" },
    { url: "https://salsox.com/blog/new-post", lastModified: new Date(Date.now() - 60_000) },
    { url: "https://salsox.com/blog/old-post", lastModified: new Date("2020-01-01T00:00:00Z") },
  ]
})

afterEach(() => {
  process.env = { ...original }
  vi.unstubAllGlobals()
})

describe("/api/indexnow", () => {
  it("refuses a request without the cron secret", async () => {
    expect((await GET(request("GET", undefined, "Bearer wrong"))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("submits only what changed recently on the scheduled run", async () => {
    const res = await GET(request("GET"))
    expect(res.status).toBe(200)
    expect(sentUrls()).toEqual(["https://salsox.com/blog/new-post"])
  })

  it("submits the whole sitemap when asked for all", async () => {
    await POST(request("POST", { all: true }))
    expect(sentUrls()).toHaveLength(3)
  })

  it("submits the given paths, made absolute", async () => {
    await POST(request("POST", { urls: ["/pricing"] }))
    expect(sentUrls()).toEqual(["https://salsox.com/pricing"])
  })

  it("rejects a body that is neither shape", async () => {
    expect((await POST(request("POST", { urls: [] }))).status).toBe(400)
  })

  // A demo is noindex: telling engines to come and fetch it would be noise.
  it("sends nothing from a demo deployment", async () => {
    process.env.DEMO_MODE = "true"
    const body = await (await GET(request("GET"))).json()
    expect(body.status).toBe("skipped")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("reports a refusal from the engine as a failure", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
    expect((await GET(request("GET"))).status).toBe(502)
  })
})
