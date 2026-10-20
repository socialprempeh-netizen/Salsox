/**
 * Google sign-in for the SEO agent: a service account's key (base64 of the
 * JSON key file, the same GA_SERVICE_ACCOUNT_KEY_BASE64 the Traffic tab uses)
 * exchanged for an access token with a signed JWT (RFC 7523), then Search
 * Console's search analytics read with it.
 *
 * Its own copy of the token exchange rather than an import from the admin's
 * GA code (src/lib/admin/ga-data.ts), because this module is kept free of the
 * rest of the app so it can be lifted out whole. The key is decoded here and
 * nowhere else: it never reaches a log line, a response or the database.
 *
 * Search Console needs the service account added to the property as a user
 * (Settings → Users and permissions, "Restricted" is enough). Query shape,
 * after gum's Search Console operation (github.com/ehmo/gum): POST
 * searchAnalytics/query with dimensions, `type: web`, `dataState: final`,
 * and `rowLimit` 25,000 with `startRow` paging until a short page.
 */
import { createSign } from "node:crypto"
import type { SearchRow } from "./opportunities"

export type ServiceAccountKey = { clientEmail: string; privateKey: string; tokenUri: string }

export const SEARCH_CONSOLE_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"

/** The key from its base64 form, or null when it is missing or is not a service account key. */
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

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")

export function jwtAssertion(key: ServiceAccountKey, scope: string, now: number): string {
  const iat = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(JSON.stringify({ iss: key.clientEmail, scope, aud: key.tokenUri, iat, exp: iat + 3600 }))
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.privateKey)
  return `${header}.${claims}.${base64url(signature)}`
}

// One token per scope per server instance, reused until a minute before it expires.
const tokens = new Map<string, { value: string; expires: number }>()

export async function accessToken(key: ServiceAccountKey, scope: string): Promise<string> {
  const cacheKey = `${key.clientEmail} ${scope}`
  const cached = tokens.get(cacheKey)
  if (cached && cached.expires > Date.now() + 60_000) return cached.value
  const res = await fetch(key.tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwtAssertion(key, scope, Date.now()) }),
    cache: "no-store",
  })
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string; error?: string }
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in failed: ${body.error_description ?? body.error ?? res.status}`)
  tokens.set(cacheKey, { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 })
  return body.access_token
}

const PAGE_SIZE = 25_000
/** A safety stop: 100,000 query+page rows is far beyond what one site needs. */
const MAX_PAGES = 4

/** yyyy-mm-dd, UTC. */
export const isoDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * The search analytics window: `days` days ending three days ago, because
 * Search Console's final data lags by two to three days and a window ending
 * today would undercount its last days.
 */
export function searchWindow(now: Date, days: number): { startDate: string; endDate: string } {
  const end = new Date(now.getTime() - 3 * 86_400_000)
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  return { startDate: isoDay(start), endDate: isoDay(end) }
}

type SearchAnalyticsResponse = { rows?: { keys?: string[]; clicks?: number; impressions?: number; position?: number }[]; error?: { message?: string } }

/**
 * The property's pages by search clicks, most first, as pathnames: the
 * fallback for "busiest pages" when Google Analytics is not connected.
 */
export async function fetchTopSearchPages({ key, siteUrl, startDate, endDate, limit }: { key: ServiceAccountKey; siteUrl: string; startDate: string; endDate: string; limit: number }): Promise<string[]> {
  const token = await accessToken(key, SEARCH_CONSOLE_SCOPE)
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ startDate, endDate, dimensions: ["page"], type: "web", rowLimit: limit }),
    cache: "no-store",
  })
  const json = (await res.json().catch(() => ({}))) as SearchAnalyticsResponse
  if (!res.ok) throw new Error(`Search Console answered ${res.status}: ${json.error?.message ?? "no detail"}`)
  return (json.rows ?? [])
    .sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0))
    .flatMap((r) => {
      try {
        return [new URL(r.keys?.[0] ?? "").pathname]
      } catch {
        return []
      }
    })
}

/** Every query+page row for the property over the window. */
export async function fetchSearchRows({ key, siteUrl, startDate, endDate }: { key: ServiceAccountKey; siteUrl: string; startDate: string; endDate: string }): Promise<SearchRow[]> {
  const token = await accessToken(key, SEARCH_CONSOLE_SCOPE)
  const url = `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`
  const rows: SearchRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate, endDate, dimensions: ["query", "page"], type: "web", dataState: "final", rowLimit: PAGE_SIZE, startRow: page * PAGE_SIZE }),
      cache: "no-store",
    })
    const json = (await res.json().catch(() => ({}))) as SearchAnalyticsResponse
    if (!res.ok) throw new Error(`Search Console answered ${res.status}: ${json.error?.message ?? "no detail"}`)
    const batch = json.rows ?? []
    for (const r of batch) {
      const [query, pageUrl] = r.keys ?? []
      if (!query || !pageUrl) continue
      rows.push({ query, page: pageUrl, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 })
    }
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}
