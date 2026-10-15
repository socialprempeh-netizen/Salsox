import { createHmac } from "node:crypto"

/**
 * IndexNow: telling search engines a URL changed, instead of waiting for them
 * to notice.
 *
 * One POST to api.indexnow.org reaches every participating engine (Bing,
 * Yandex, Seznam, Naver and others share submissions). The engine proves the
 * site sent it by fetching a key file from the site itself: `/{key}.txt`, the
 * protocol's default location, which the proxy (src/proxy.ts) serves from
 * `src/app/indexnow-key.txt/route.ts`. `/indexnow-key.txt` still answers too.
 *
 * Everything that decides something is a pure function in this file: which key,
 * which URLs, what payload, whether a deployment may ping. The database side
 * (what was already submitted, the log) is src/lib/indexnow-store.ts, and the
 * route in `src/app/api/indexnow/route.ts` wires it to the cron and the proxy.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
/** A fixed alias of the key file, kept so links to it keep working. */
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt"
/** The key file where the protocol looks by default: `/{key}.txt` at the root. */
export const indexNowKeyFilePath = (key: string) => `/${key}.txt`
/** The protocol's ceiling per request. */
export const INDEXNOW_MAX_URLS = 10_000

/** The protocol's rule for a key: 8 to 128 characters, letters, digits, dashes. */
export function isValidIndexNowKey(key: string): boolean {
  return /^[a-zA-Z0-9-]{8,128}$/.test(key)
}

/**
 * The key this deployment uses, or null when IndexNow is off.
 *
 * `INDEXNOW_KEY` wins when set. Without it the key is derived from
 * `CRON_SECRET`, which production already requires, so IndexNow works with no
 * extra setting. The derivation is an HMAC: the key file is public by design,
 * and nothing about the secret can be recovered from it. Rotating the secret
 * rotates the key and the file together, so they never disagree.
 */
export function resolveIndexNowKey(env: Record<string, string | undefined>): string | null {
  const explicit = env.INDEXNOW_KEY?.trim()
  if (explicit) return isValidIndexNowKey(explicit) ? explicit : null
  const secret = env.CRON_SECRET?.trim()
  if (!secret) return null
  return createHmac("sha256", secret).update("indexnow-key").digest("hex").slice(0, 32)
}

/**
 * The URLs worth submitting from a list: absolute, on this site's own host,
 * each once. Engines reject a whole request that names another host, so a
 * stray external link must be dropped here rather than sink the rest. Site
 * paths ("/pricing") are accepted and made absolute.
 */
export function normalizeUrls(siteUrl: string, urls: string[]): string[] {
  const site = new URL(siteUrl)
  const out = new Set<string>()
  for (const raw of urls) {
    let url: URL
    try {
      url = new URL(raw, site)
    } catch {
      continue
    }
    if (url.host !== site.host || !/^https?:$/.test(url.protocol)) continue
    url.hash = ""
    out.add(url.toString())
  }
  return [...out]
}

/**
 * Sitemap entries modified since a moment. An entry with no `lastModified`
 * says nothing about when it changed, so it is not counted as recent; those
 * pages are submitted by asking for everything (`{ "all": true }`).
 */
export function changedSince(
  entries: { url: string; lastModified?: string | Date }[],
  since: Date,
): string[] {
  return entries
    .filter((e) => e.lastModified !== undefined && new Date(e.lastModified).getTime() >= since.getTime())
    .map((e) => e.url)
}

export type IndexNowPayload = { host: string; key: string; keyLocation: string; urlList: string[] }

/** One request body per 10,000 URLs, the most the protocol accepts at once. */
export function indexNowPayloads(siteUrl: string, key: string, urls: string[]): IndexNowPayload[] {
  const site = new URL(siteUrl)
  const list = normalizeUrls(siteUrl, urls)
  const payloads: IndexNowPayload[] = []
  for (let i = 0; i < list.length; i += INDEXNOW_MAX_URLS) {
    payloads.push({
      host: site.host,
      key,
      // Was `${site.origin}${INDEXNOW_KEY_PATH}`. Now the protocol's default
      // location, which engines also check on their own, so the key and the
      // file it is named after cannot be read as two different claims.
      // keyLocation: `${site.origin}${INDEXNOW_KEY_PATH}`,
      keyLocation: `${site.origin}${indexNowKeyFilePath(key)}`,
      urlList: list.slice(i, i + INDEXNOW_MAX_URLS),
    })
  }
  return payloads
}

/**
 * Sends the URLs. Resolves with what each request answered: 200 and 202 are
 * success (202 means the key is still being verified), 403 a key the engine
 * could not fetch or match, 422 URLs that do not belong to the host.
 */
export async function submitToIndexNow(
  siteUrl: string,
  key: string,
  urls: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ submitted: number; statuses: number[] }> {
  const payloads = indexNowPayloads(siteUrl, key, urls)
  const statuses: number[] = []
  for (const payload of payloads) {
    const response = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    })
    statuses.push(response.status)
  }
  return { submitted: payloads.reduce((n, p) => n + p.urlList.length, 0), statuses }
}

/** True when `pathname` is this deployment's key file, `/{key}.txt`. */
export function isKeyFilePath(pathname: string, key: string | null): boolean {
  return key !== null && pathname === indexNowKeyFilePath(key)
}

/**
 * The sitemap URLs search engines have not been told about yet: never
 * submitted, or changed (a later `lastModified`) since the last accepted
 * submission. `submitted` maps each URL to the `lastModified` it was accepted
 * at (null when the entry had none). An entry without `lastModified` is sent
 * once and then only again if it gains a date.
 */
export function pendingUrls(
  entries: { url: string; lastModified?: string | Date }[],
  submitted: Map<string, Date | null>,
): { url: string; lastModified: Date | null }[] {
  const out: { url: string; lastModified: Date | null }[] = []
  for (const e of entries) {
    const modified = e.lastModified === undefined ? null : new Date(e.lastModified)
    if (!submitted.has(e.url)) {
      out.push({ url: e.url, lastModified: modified })
      continue
    }
    const before = submitted.get(e.url) ?? null
    if (modified && (!before || modified.getTime() > before.getTime())) out.push({ url: e.url, lastModified: modified })
  }
  return out
}

/** 200 and 202 mean accepted (202: the key is still being checked). */
export const isAcceptedStatus = (status: number) => status === 200 || status === 202

/**
 * The deployment a deploy-time ping belongs to, or null when this server must
 * not send one: only a Vercel production deployment pings, since a preview
 * shares the production site URL and would announce pages that are not live.
 */
export function deployPingId(env: Record<string, string | undefined>): string | null {
  if (env.VERCEL_ENV !== "production") return null
  return env.VERCEL_DEPLOYMENT_ID?.trim() || env.VERCEL_GIT_COMMIT_SHA?.trim() || null
}
