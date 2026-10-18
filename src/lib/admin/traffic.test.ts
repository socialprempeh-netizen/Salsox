/**
 * Tests for traffic.ts: the date ranges the GA traffic page accepts, the
 * settings it needs, and how GA's report rows become what the page draws.
 */
import { describe, expect, it } from "vitest"
import { dailySeries, eventCounts, normalizePropertyId, pageRows, parseServiceAccountKey, resolveRange, shareRows, totalsOf } from "./traffic"

const today = new Date("2026-10-18T15:00:00Z")
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64")
const row = (dims: string[], metrics: (string | number)[]) => ({ dimensionValues: dims.map((value) => ({ value })), metricValues: metrics.map((m) => ({ value: String(m) })) })

describe("resolveRange", () => {
  it("is the last 30 days, today included, by default", () => {
    expect(resolveRange({}, today)).toEqual({ start: "2026-09-19", end: "2026-10-18", days: 30, preset: 30 })
  })

  it("takes a preset", () => {
    expect(resolveRange({ days: "7" }, today)).toEqual({ start: "2026-10-12", end: "2026-10-18", days: 7, preset: 7 })
    expect(resolveRange({ days: "45" }, today).preset).toBe(30)
  })

  it("takes a custom range, inclusive at both ends", () => {
    expect(resolveRange({ from: "2026-10-01", to: "2026-10-10" }, today)).toEqual({ start: "2026-10-01", end: "2026-10-10", days: 10, preset: null })
    expect(resolveRange({ from: "2026-10-18", to: "2026-10-18" }, today).days).toBe(1)
  })

  it("falls back to the default for a range that makes no sense", () => {
    for (const bad of [
      { from: "2026-10-10", to: "2026-10-01" },
      { from: "2026-10-01", to: "2026-10-19" },
      { from: "2024-01-01", to: "2026-10-01" },
      { from: "2026-02-30", to: "2026-03-02" },
      { from: "2015-01-01", to: "2015-12-01" },
      { from: "yesterday", to: "today" },
    ]) {
      expect(resolveRange(bad, today).preset).toBe(30)
    }
  })
})

describe("parseServiceAccountKey", () => {
  const key = { type: "service_account", client_email: "ga@proj.iam.gserviceaccount.com", private_key: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n", token_uri: "https://oauth2.googleapis.com/token" }

  it("reads a base64-encoded key file", () => {
    expect(parseServiceAccountKey(b64(key))).toEqual({ clientEmail: key.client_email, privateKey: key.private_key, tokenUri: key.token_uri })
  })

  it("is null when missing, not base64 JSON, or not a service account", () => {
    expect(parseServiceAccountKey(undefined)).toBeNull()
    expect(parseServiceAccountKey("   ")).toBeNull()
    expect(parseServiceAccountKey("not base64 json")).toBeNull()
    expect(parseServiceAccountKey(b64({ ...key, private_key: "nope" }))).toBeNull()
    expect(parseServiceAccountKey(b64({ ...key, client_email: undefined }))).toBeNull()
  })

  it("never sends the token request anywhere but https", () => {
    expect(parseServiceAccountKey(b64({ ...key, token_uri: "http://evil.example" }))?.tokenUri).toBe("https://oauth2.googleapis.com/token")
  })
})

describe("normalizePropertyId", () => {
  it("accepts the number, or the properties/ form", () => {
    expect(normalizePropertyId("123456789")).toBe("123456789")
    expect(normalizePropertyId(" properties/123456789 ")).toBe("123456789")
  })

  it("refuses a measurement id or anything else", () => {
    expect(normalizePropertyId("G-8G6CGEVFV8")).toBeNull()
    expect(normalizePropertyId("")).toBeNull()
    expect(normalizePropertyId(undefined)).toBeNull()
  })
})

describe("report shaping", () => {
  it("fills the days GA leaves out with zeros", () => {
    const range = resolveRange({ from: "2026-10-01", to: "2026-10-03" }, today)
    const series = dailySeries({ rows: [row(["20261003"], [5, 7]), row(["20261001"], [2, 3])] }, range)
    expect(series).toEqual([
      { date: "2026-10-01", visitors: 2, sessions: 3 },
      { date: "2026-10-02", visitors: 0, sessions: 0 },
      { date: "2026-10-03", visitors: 5, sessions: 7 },
    ])
  })

  it("gives shares of the whole, largest first", () => {
    const rows = shareRows({ rows: [row(["desktop"], [25]), row(["mobile"], [75])] })
    expect(rows).toEqual([
      { label: "mobile", value: 75, share: 0.75 },
      { label: "desktop", value: 25, share: 0.25 },
    ])
    expect(shareRows(undefined)).toEqual([])
  })

  it("orders pages by views and caps the list", () => {
    const report = { rows: Array.from({ length: 12 }, (_, i) => row([`/p${i}`], [i, 1])) }
    const rows = pageRows(report)
    expect(rows).toHaveLength(10)
    expect(rows[0]).toEqual({ path: "/p11", views: 11, visitors: 1 })
  })

  it("reads totals, and zeros when GA returns nothing", () => {
    expect(totalsOf({ rows: [row([], [10, 12, 40, "0.5"])] })).toEqual({ visitors: 10, sessions: 12, pageViews: 40, engagementRate: 0.5 })
    expect(totalsOf({})).toEqual({ visitors: 0, sessions: 0, pageViews: 0, engagementRate: 0 })
  })

  it("counts only the conversion events", () => {
    expect(eventCounts({ rows: [row(["sign_up"], [4]), row(["page_view"], [99])] })).toEqual({ sign_up: 4, document_sent: 0 })
  })
})
