/**
 * Google Analytics 4 traffic for /admin/analytics/traffic, read through the
 * GA Data API. Server only, admin only (the page checks the role).
 *
 * Settings: GA4_PROPERTY_ID (the property's number, Admin → Property
 * details) and GA_SERVICE_ACCOUNT_KEY_BASE64 (a Google Cloud service account
 * key file, base64-encoded), with that service account added as a Viewer on
 * the property. The key is decoded here and nowhere else: it never reaches a
 * component, a response or a log line.
 *
 * Talks to Google's REST endpoints directly with Node's crypto, rather than
 * through the googleapis client, which is a large dependency for two calls:
 * a signed JWT is exchanged for an access token (kept until shortly before
 * it expires), then one batch of five reports and one events report.
 *
 * Results are cached for CACHE_SECONDS per property and date range, so
 * reloading the page does not spend GA's request quota; errors are thrown
 * from inside the cache and so are never cached.
 */
import { createSign } from "node:crypto"
import { unstable_cache } from "next/cache"
import {
  CONVERSION_EVENTS,
  dailySeries,
  eventCounts,
  normalizePropertyId,
  pageRows,
  parseServiceAccountKey,
  shareRows,
  totalsOf,
  type ConversionEvent,
  type DailyPoint,
  type GaReport,
  type PageRow,
  type ServiceAccountKey,
  type ShareRow,
  type TrafficRange,
  type TrafficTotals,
} from "./traffic"

export const CACHE_SECONDS = 300

const SCOPE = "https://www.googleapis.com/auth/analytics.readonly"
const API = "https://analyticsdata.googleapis.com/v1beta"

export type TrafficData = {
  totals: TrafficTotals
  series: DailyPoint[]
  pages: PageRow[]
  sources: ShareRow[]
  devices: ShareRow[]
  events: Record<ConversionEvent, number>
  /** When GA answered, for the "as of" line. ISO string, as the cache stores JSON. */
  fetchedAt: string
}

export type TrafficReport = { state: "notConfigured"; missing: ("key" | "property")[] } | { state: "error"; message: string } | ({ state: "ok" } & TrafficData)

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")

/** A service account's signed JWT, exchanged for an access token (RFC 7523). */
export function jwtAssertion(key: ServiceAccountKey, now: number): string {
  const iat = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(JSON.stringify({ iss: key.clientEmail, scope: SCOPE, aud: key.tokenUri, iat, exp: iat + 3600 }))
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.privateKey)
  return `${header}.${claims}.${base64url(signature)}`
}

// One token per server instance, reused until a minute before it expires.
let token: { value: string; expires: number; for: string } | null = null

async function accessToken(key: ServiceAccountKey): Promise<string> {
  if (token && token.for === key.clientEmail && token.expires > Date.now() + 60_000) return token.value
  const res = await fetch(key.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwtAssertion(key, Date.now()) }),
    cache: "no-store",
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string }
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`)
  token = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000, for: key.clientEmail }
  return token.value
}

async function callGa<T>(path: string, accessTokenValue: string, body: unknown): Promise<T> {
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessTokenValue}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `Google Analytics answered ${res.status}`)
  return json
}

const metrics = (...names: string[]) => names.map((name) => ({ name }))
const dims = (...names: string[]) => names.map((name) => ({ name }))
const byMetric = (metricName: string) => [{ metric: { metricName }, desc: true }]

async function fetchTraffic(propertyId: string, range: TrafficRange): Promise<TrafficData> {
  const key = parseServiceAccountKey(process.env.GA_SERVICE_ACCOUNT_KEY_BASE64)
  if (!key) throw new Error("GA_SERVICE_ACCOUNT_KEY_BASE64 is not a service account key")
  const auth = await accessToken(key)
  const dateRanges = [{ startDate: range.start, endDate: range.end }]

  // Five reports is the most one batch call takes; the events go separately.
  const [batch, events] = await Promise.all([
    callGa<{ reports?: GaReport[] }>(`properties/${propertyId}:batchRunReports`, auth, {
      requests: [
        { dateRanges, dimensions: dims("date"), metrics: metrics("activeUsers", "sessions"), orderBys: [{ dimension: { dimensionName: "date" } }] },
        { dateRanges, metrics: metrics("activeUsers", "sessions", "screenPageViews", "engagementRate") },
        { dateRanges, dimensions: dims("pagePath"), metrics: metrics("screenPageViews", "activeUsers"), orderBys: byMetric("screenPageViews"), limit: 10 },
        { dateRanges, dimensions: dims("sessionSourceMedium"), metrics: metrics("sessions"), orderBys: byMetric("sessions"), limit: 25 },
        { dateRanges, dimensions: dims("deviceCategory"), metrics: metrics("activeUsers"), orderBys: byMetric("activeUsers") },
      ],
    }),
    callGa<GaReport>(`properties/${propertyId}:runReport`, auth, {
      dateRanges,
      dimensions: dims("eventName"),
      metrics: metrics("eventCount"),
      dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: [...CONVERSION_EVENTS] } } },
    }),
  ])

  const [series, totals, pages, sources, devices] = batch.reports ?? []
  return {
    totals: totalsOf(totals),
    series: dailySeries(series, range),
    pages: pageRows(pages),
    sources: shareRows(sources),
    devices: shareRows(devices),
    events: eventCounts(events),
    fetchedAt: new Date().toISOString(),
  }
}

/**
 * The most viewed page paths over the last `days` days, busiest first. Used by
 * the SEO agent (src/lib/seo-agent/site.ts) to choose which pages link to a
 * new article. Throws when GA is not configured, so the caller can fall back.
 */
export async function topPagePaths(days: number, limit: number): Promise<string[]> {
  const propertyId = normalizePropertyId(process.env.GA4_PROPERTY_ID)
  const key = parseServiceAccountKey(process.env.GA_SERVICE_ACCOUNT_KEY_BASE64)
  if (!propertyId || !key) throw new Error("Google Analytics is not configured (GA4_PROPERTY_ID and GA_SERVICE_ACCOUNT_KEY_BASE64)")
  const report = await callGa<GaReport>(`properties/${propertyId}:runReport`, await accessToken(key), {
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: dims("pagePath"),
    metrics: metrics("screenPageViews"),
    orderBys: byMetric("screenPageViews"),
    limit,
  })
  return pageRows(report, limit).map((p) => p.path)
}

/** The cached fetch: keyed by its arguments, kept CACHE_SECONDS. */
const cachedTraffic = unstable_cache(fetchTraffic, ["admin-ga-traffic"], { revalidate: CACHE_SECONDS, tags: ["admin-ga-traffic"] })

export async function trafficReport(range: TrafficRange): Promise<TrafficReport> {
  const propertyId = normalizePropertyId(process.env.GA4_PROPERTY_ID)
  const hasKey = Boolean(process.env.GA_SERVICE_ACCOUNT_KEY_BASE64?.trim())
  if (!propertyId || !hasKey) {
    return { state: "notConfigured", missing: [...(hasKey ? [] : ["key" as const]), ...(propertyId ? [] : ["property" as const])] }
  }
  try {
    return { state: "ok", ...(await cachedTraffic(propertyId, range)) }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error)
    console.error("[admin/traffic] GA Data API failed:", text)
    return { state: "error", message: text.slice(0, 300) }
  }
}
