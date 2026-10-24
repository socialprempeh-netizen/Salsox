/**
 * Orphan Page Scanner: the scan itself, run in the extension's service
 * worker so it keeps going when the popup closes (a popup is closed as soon
 * as it loses focus).
 *
 * The popup sends { type: "scan", origin, maxPages } after the user has
 * granted access to that one site; this reads the sitemap, fetches every
 * listed page a few at a time, and saves progress and the final result in
 * chrome.storage.local under "scan:<origin>", which the popup watches. Only
 * the site being scanned is ever contacted, without cookies: nothing is sent
 * to Salsox or anywhere else.
 */
import { extractLinks, findOrphans, normalizeUrl, parseSitemap, sitemapsFromRobots } from "./lib/scan.js"

const CONCURRENCY = 4
const PAGE_TIMEOUT_MS = 15_000
const MAX_SITEMAPS = 25

/** Scans running now, by origin, so one can be cancelled and none started twice. */
const running = new Map()

const key = (origin) => `scan:${origin}`
const save = (origin, state) => chrome.storage.local.set({ [key(origin)]: state })

async function fetchText(url, signal) {
  const response = await fetch(url, { credentials: "omit", redirect: "follow", signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]) })
  return { response, text: response.ok ? await response.text() : "" }
}

/** Every page the site's sitemaps list (robots.txt first, then /sitemap.xml), normalized, at most `maxPages`. */
async function listedPages(origin, maxPages, signal) {
  let queue = []
  try {
    const { response, text } = await fetchText(`${origin}/robots.txt`, signal)
    if (response.ok) queue = sitemapsFromRobots(text)
  } catch {
    // No robots.txt: fall back to the usual sitemap address.
  }
  if (queue.length === 0) queue = [`${origin}/sitemap.xml`]
  const seen = new Set()
  const pages = new Set()
  while (queue.length && seen.size < MAX_SITEMAPS && pages.size < maxPages) {
    const sitemap = queue.shift()
    if (seen.has(sitemap)) continue
    seen.add(sitemap)
    try {
      const { response, text } = await fetchText(sitemap, signal)
      if (!response.ok) continue
      const parsed = parseSitemap(text)
      queue.push(...parsed.sitemaps)
      for (const loc of parsed.pages) {
        const url = normalizeUrl(loc, origin, origin)
        if (url) pages.add(url)
        if (pages.size >= maxPages) break
      }
    } catch (error) {
      if (signal.aborted) throw error
    }
  }
  return { pages: [...pages], sitemaps: [...seen] }
}

async function scan(origin, maxPages) {
  const controller = new AbortController()
  running.set(origin, controller)
  const started = Date.now()
  try {
    await save(origin, { phase: "sitemap", origin, started })
    const { pages, sitemaps } = await listedPages(origin, maxPages, controller.signal)
    if (pages.length === 0) {
      await save(origin, { phase: "done", origin, started, finished: Date.now(), sitemaps, listed: 0, rows: [], orphans: [], failed: 0, noSitemap: true })
      return
    }

    const crawled = []
    const status = new Map()
    let next = 0
    let done = 0
    const worker = async () => {
      while (next < pages.length) {
        const url = pages[next++]
        try {
          const { response, text } = await fetchText(url, controller.signal)
          status.set(url, response.status)
          const html = (response.headers.get("content-type") ?? "").includes("html")
          // Links are read from the address the page ended up at, after any redirect.
          if (response.ok && html) crawled.push({ url, links: extractLinks(text, response.url || url, origin) })
        } catch {
          if (controller.signal.aborted) return
          status.set(url, "error")
        }
        done++
        if (done % 5 === 0 || done === pages.length) await save(origin, { phase: "crawl", origin, started, listed: pages.length, done })
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    if (controller.signal.aborted) {
      await save(origin, { phase: "cancelled", origin, started })
      return
    }

    const { orphans, inbound } = findOrphans(pages, crawled)
    const orphanSet = new Set(orphans)
    const rows = pages.map((url) => ({ url, inbound: inbound.get(url) ?? 0, status: status.get(url) ?? "error", orphan: orphanSet.has(url) }))
    const failed = rows.filter((r) => r.status !== 200).length
    await save(origin, { phase: "done", origin, started, finished: Date.now(), sitemaps, listed: pages.length, rows, orphans, failed, capped: pages.length >= maxPages })
  } catch (error) {
    await save(origin, { phase: controller.signal.aborted ? "cancelled" : "error", origin, started, message: String(error?.message ?? error).slice(0, 200) })
  } finally {
    running.delete(origin)
  }
}

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  if (message?.type === "scan" && typeof message.origin === "string") {
    if (!running.has(message.origin)) scan(message.origin, Math.min(Math.max(Number(message.maxPages) || 250, 10), 1000))
    reply({ ok: true })
  } else if (message?.type === "cancel" && typeof message.origin === "string") {
    running.get(message.origin)?.abort()
    reply({ ok: true })
  }
})
