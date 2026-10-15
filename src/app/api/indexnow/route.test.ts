import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// The sitemap reads content from disk; here it is fixed, so these tests are
// about what the endpoint does with it. The protocol rules have their own
// tests in src/lib/indexnow.test.ts.
const entries = vi.hoisted(() => ({
  current: [] as { url: string; lastModified?: Date }[],
}))
vi.mock("@/app/sitemap", () => ({ default: () => entries.current }))
vi.mock("@/config/site", () => ({ siteConfig: { url: "https://salsox.com" } }))

// The three IndexNow tables, in memory: enough of Prisma for the store.
const db = vi.hoisted(() => ({
  pings: [] as Record<string, unknown>[],
  urls: new Map<string, { url: string; lastModified: Date | null; submittedAt: Date }>(),
  deploys: new Set<string>(),
}))
vi.mock("@/lib/prisma", () => ({
  prisma: {
    indexNowPing: {
      create: async ({ data }: { data: Record<string, unknown> }) => db.pings.push(data),
    },
    indexNowUrl: {
      findMany: async () => [...db.urls.values()],
      upsert: async ({ create }: { create: { url: string; lastModified: Date | null; submittedAt: Date } }) => db.urls.set(create.url, create),
    },
    indexNowDeploy: {
      create: async ({ data }: { data: { id: string } }) => {
        if (db.deploys.has(data.id)) throw Object.assign(new Error("unique"), { code: "P2002" })
        db.deploys.add(data.id)
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}))

import { GET, POST } from "./route"

const original = { ...process.env }
const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))

const request = (method: string, body?: unknown, auth = "Bearer cron", query = "") =>
  new Request(`https://salsox.com/api/indexnow${query}`, {
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
  delete process.env.VERCEL_ENV
  delete process.env.VERCEL_DEPLOYMENT_ID
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockClear()
  db.pings.length = 0
  db.urls.clear()
  db.deploys.clear()
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

  // Was: "submits only what changed recently on the scheduled run" (a
  // two-day window). The run now diffs against what was already accepted.
  it("submits everything never sent, then only what changed since", async () => {
    expect((await GET(request("GET"))).status).toBe(200)
    expect(sentUrls()).toHaveLength(3)

    fetchMock.mockClear()
    const again = await (await GET(request("GET"))).json()
    expect(again.status).toBe("nothing")
    expect(fetchMock).not.toHaveBeenCalled()

    entries.current[2] = { url: "https://salsox.com/blog/old-post", lastModified: new Date() }
    await GET(request("GET"))
    expect(sentUrls()).toEqual(["https://salsox.com/blog/old-post"])
  })

  it("logs each submission with its trigger and status", async () => {
    await GET(request("GET"))
    expect(db.pings).toEqual([expect.objectContaining({ trigger: "cron", urlCount: 3, status: 200, ok: true, error: null })])
  })

  it("keeps a refused submission pending and logs the refusal", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
    expect((await GET(request("GET"))).status).toBe(502)
    expect(db.pings[0]).toMatchObject({ status: 403, ok: false })
    expect(db.urls.size).toBe(0)
  })

  it("logs a request that got no answer as status 0, without throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"))
    expect((await GET(request("GET"))).status).toBe(502)
    expect(db.pings[0]).toMatchObject({ status: 0, ok: false, error: "network down" })
  })

  it("runs the deploy sync once per production deployment", async () => {
    process.env.VERCEL_ENV = "production"
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_1"
    await GET(request("GET", undefined, "Bearer cron", "?trigger=deploy"))
    expect(db.pings[0]).toMatchObject({ trigger: "deploy", urlCount: 3 })

    const second = await (await GET(request("GET", undefined, "Bearer cron", "?trigger=deploy"))).json()
    expect(second).toEqual({ status: "skipped", reason: "this deployment has already synced" })
    expect(db.pings).toHaveLength(1)
  })

  it("never runs the deploy sync outside production", async () => {
    process.env.VERCEL_ENV = "preview"
    process.env.VERCEL_DEPLOYMENT_ID = "dpl_1"
    const body = await (await GET(request("GET", undefined, "Bearer cron", "?trigger=deploy"))).json()
    expect(body.status).toBe("skipped")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("submits the whole sitemap when asked for all", async () => {
    await POST(request("POST", { all: true }))
    expect(sentUrls()).toHaveLength(3)
  })

  it("submits the given paths, made absolute, and remembers them", async () => {
    await POST(request("POST", { urls: ["/pricing"] }))
    expect(sentUrls()).toEqual(["https://salsox.com/pricing"])
    expect([...db.urls.keys()]).toEqual(["https://salsox.com/pricing"])
    expect(db.pings[0]).toMatchObject({ trigger: "manual" })
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
})
