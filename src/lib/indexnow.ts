import { createHmac } from "node:crypto"

/**
 * IndexNow: telling search engines a URL changed, instead of waiting for them
 * to notice.
 *
 * One POST to api.indexnow.org reaches every participating engine (Bing,
 * Yandex, Seznam, Naver and others share submissions). The engine proves the
 * site sent it by fetching a key file from the site itself, served here at
 * `/indexnow-key.txt` (see `src/app/indexnow-key.txt/route.ts`) and named in
 * each submission as `keyLocation`.
 *
 * Everything that decides something is a pure function in this file: which key,
 * which URLs, what payload. The route in `src/app/api/indexnow/route.ts` only
 * wires them to the sitemap and to `fetch`.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt"
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
      keyLocation: `${site.origin}${INDEXNOW_KEY_PATH}`,
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
