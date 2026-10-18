/**
 * The rules behind /admin/analytics/traffic, the admin page that reads
 * Google Analytics 4 through its Data API: which date range a URL asks for,
 * which settings make GA reachable, and how GA's report rows become the
 * series and tables the page draws. Pure functions over plain values; the
 * calls to Google are in ga-data.ts, which is server only.
 *
 * Kept free of Node and Next imports so the client chart can share its types.
 */

const DAY = 24 * 60 * 60 * 1000

/** The quick ranges the page offers, in days. */
export const TRAFFIC_PRESETS = [7, 30, 90] as const

/** The longest custom range: GA answers more, but a year is plenty to read. */
export const MAX_RANGE_DAYS = 366

/** GA4 has no data before it existed. */
const GA4_EPOCH = "2015-08-14"

export type TrafficRange = {
  /** Inclusive, YYYY-MM-DD. */
  start: string
  end: string
  days: number
  /** The preset it matches, or null for a custom range. */
  preset: number | null
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A YYYY-MM-DD string for a UTC date. */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseDay(value: string | undefined): Date | null {
  if (!value || !ISO_DATE.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  // Rejects dates that roll over, like 2026-02-30.
  return Number.isNaN(date.getTime()) || isoDay(date) !== value ? null : date
}

/**
 * The range a request asks for: `from` and `to` together as a custom range,
 * else `days` as one of the presets ending today, else the last 30 days.
 * Anything that does not make sense (reversed, in the future, before GA4,
 * longer than MAX_RANGE_DAYS) falls back to the default rather than erroring.
 */
export function resolveRange(params: { days?: string; from?: string; to?: string }, today: Date = new Date()): TrafficRange {
  const end = parseDay(isoDay(today))!
  const preset = (days: number): TrafficRange => ({ start: isoDay(new Date(end.getTime() - (days - 1) * DAY)), end: isoDay(end), days, preset: days })

  const from = parseDay(params.from)
  const to = parseDay(params.to)
  if (from && to) {
    const days = Math.round((to.getTime() - from.getTime()) / DAY) + 1
    if (days >= 1 && days <= MAX_RANGE_DAYS && to <= end && isoDay(from) >= GA4_EPOCH) {
      return { start: isoDay(from), end: isoDay(to), days, preset: null }
    }
  }
  const n = Number(params.days)
  return (TRAFFIC_PRESETS as readonly number[]).includes(n) ? preset(n) : preset(30)
}

export type ServiceAccountKey = { clientEmail: string; privateKey: string; tokenUri: string }

/**
 * The service account key from GA_SERVICE_ACCOUNT_KEY_BASE64: the JSON key
 * file Google Cloud downloads, base64-encoded so it fits in one variable.
 * Null when it is missing or not a service account key.
 */
export function parseServiceAccountKey(base64: string | undefined): ServiceAccountKey | null {
  const raw = base64?.trim()
  if (!raw) return null
  try {
    const json = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Record<string, unknown>
    const { client_email: clientEmail, private_key: privateKey, token_uri: tokenUri } = json
    if (typeof clientEmail !== "string" || !clientEmail.includes("@")) return null
    if (typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) return null
    return { clientEmail, privateKey, tokenUri: typeof tokenUri === "string" && tokenUri.startsWith("https://") ? tokenUri : "https://oauth2.googleapis.com/token" }
  } catch {
    return null
  }
}

/** GA4_PROPERTY_ID as the bare number GA wants; "properties/123" is accepted too. */
export function normalizePropertyId(raw: string | undefined): string | null {
  const id = raw?.trim().replace(/^properties\//, "")
  return id && /^\d{5,15}$/.test(id) ? id : null
}

/** The part of a GA Data API report this page reads. */
export type GaReport = {
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]
}

/** A report's rows as [dimension values, metric values as numbers]. */
export function readRows(report: GaReport | undefined): { dims: string[]; metrics: number[] }[] {
  return (report?.rows ?? []).map((row) => ({
    dims: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    metrics: (row.metricValues ?? []).map((m) => {
      const n = Number(m.value)
      return Number.isFinite(n) ? n : 0
    }),
  }))
}

export type DailyPoint = { date: string; visitors: number; sessions: number }

/**
 * One point per day of the range, oldest first. GA leaves out the days with
 * no visits; a line that skipped them would draw a slope across a gap, so
 * they come back as zeros. GA's dates are YYYYMMDD.
 */
export function dailySeries(report: GaReport | undefined, range: TrafficRange): DailyPoint[] {
  const byDay = new Map<string, { visitors: number; sessions: number }>()
  for (const { dims, metrics } of readRows(report)) {
    const d = dims[0]
    if (!/^\d{8}$/.test(d)) continue
    byDay.set(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, { visitors: metrics[0] ?? 0, sessions: metrics[1] ?? 0 })
  }
  const start = parseDay(range.start)!.getTime()
  return Array.from({ length: range.days }, (_, i) => {
    const date = isoDay(new Date(start + i * DAY))
    return { date, ...(byDay.get(date) ?? { visitors: 0, sessions: 0 }) }
  })
}

export type ShareRow = { label: string; value: number; share: number }

/**
 * Rows of one dimension and one metric, largest first, each with its share
 * of the total. GA's "(not set)" stays as a row: hiding it would make the
 * shares add up to less than the whole without saying why.
 */
export function shareRows(report: GaReport | undefined, limit = 10): ShareRow[] {
  const rows = readRows(report).map(({ dims, metrics }) => ({ label: dims[0] ?? "", value: metrics[0] ?? 0 }))
  const total = rows.reduce((sum, r) => sum + r.value, 0)
  return rows
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((r) => ({ ...r, share: total > 0 ? r.value / total : 0 }))
}

export type PageRow = { path: string; views: number; visitors: number }

export function pageRows(report: GaReport | undefined, limit = 10): PageRow[] {
  return readRows(report)
    .map(({ dims, metrics }) => ({ path: dims[0] ?? "", views: metrics[0] ?? 0, visitors: metrics[1] ?? 0 }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit)
}

export type TrafficTotals = { visitors: number; sessions: number; pageViews: number; engagementRate: number }

export function totalsOf(report: GaReport | undefined): TrafficTotals {
  const m = readRows(report)[0]?.metrics ?? []
  return { visitors: m[0] ?? 0, sessions: m[1] ?? 0, pageViews: m[2] ?? 0, engagementRate: m[3] ?? 0 }
}

/** Events the app sends through `track` (src/lib/analytics.ts) that count as conversions here. */
export const CONVERSION_EVENTS = ["sign_up", "document_sent"] as const
export type ConversionEvent = (typeof CONVERSION_EVENTS)[number]

/** Each conversion event's count, zero when GA has none in the range. */
export function eventCounts(report: GaReport | undefined): Record<ConversionEvent, number> {
  const counts = Object.fromEntries(CONVERSION_EVENTS.map((e) => [e, 0])) as Record<ConversionEvent, number>
  for (const { dims, metrics } of readRows(report)) {
    if ((CONVERSION_EVENTS as readonly string[]).includes(dims[0])) counts[dims[0] as ConversionEvent] = metrics[0] ?? 0
  }
  return counts
}
