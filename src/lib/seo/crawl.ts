/**
 * Crawls this deployment the way a search engine would, for the admin SEO
 * health page: every URL in the sitemap, plus the private pages that must
 * never be indexed, fetched over HTTP and run through the audit rules in
 * audit.ts.
 *
 * URLs are fetched from `origin` (the deployment being looked at, so a
 * preview audits itself) but judged against the sitemap's own URLs, which is
 * what each page's canonical must match. Redirects are not followed: a URL in
 * the sitemap that redirects is itself a problem to report.
 *
 * `fetchImpl` is injectable so the rules can be tested without a network.
 */
import { auditPages, extractPageFacts, isIndexable, type Issue, type PageFacts } from "./audit"

/** Pages that must answer noindex (header or meta), whatever else they do. */
export const PRIVATE_PATHS = ["/dashboard", "/admin", "/login", "/signup", "/forgot-password", "/sign/not-a-real-token-000000000000000"]

export type CrawlResult = {
  pages: PageFacts[]
  issues: Issue[]
  privatePages: { path: string; status: number; protected: boolean }[]
  durationMs: number
}

async function fetchFacts(fetchImpl: typeof fetch, fetchUrl: string, reportUrl: string, timeoutMs: number): Promise<PageFacts> {
  try {
    const res = await fetchImpl(fetchUrl, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "SalsoxSEOAudit/1.0" } })
    const html = res.status === 200 ? await res.text() : ""
    return extractPageFacts(html, reportUrl, res.status, res.headers)
  } catch {
    return extractPageFacts("", reportUrl, 0, new Headers())
  }
}

/** Runs `fn` over `items`, `limit` at a time, keeping order. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    })
  )
  return out
}

export async function crawlSite(options: {
  origin: string
  sitemapUrls: string[]
  fetchImpl?: typeof fetch
  concurrency?: number
  timeoutMs?: number
}): Promise<CrawlResult> {
  const started = Date.now()
  const fetchImpl = options.fetchImpl ?? fetch
  const timeout = options.timeoutMs ?? 10_000
  const local = (url: string) => {
    const u = new URL(url)
    return new URL(`${u.pathname}${u.search}`, options.origin).toString()
  }

  const pages = await pool(options.sitemapUrls, options.concurrency ?? 6, (url) => fetchFacts(fetchImpl, local(url), url, timeout))
  const issues = auditPages(pages, { expectIndexable: new Set(options.sitemapUrls) })

  const privatePages = await pool(PRIVATE_PATHS, 3, async (path) => {
    const facts = await fetchFacts(fetchImpl, new URL(path, options.origin).toString(), new URL(path, options.origin).toString(), timeout)
    // Protected means: noindex, or not served at all (a redirect to sign-in, a 404).
    const isProtected = facts.status !== 200 || !isIndexable(facts)
    if (!isProtected) issues.push({ url: path, severity: "error", message: "private page is indexable (no noindex)" })
    return { path, status: facts.status, protected: isProtected }
  })

  return { pages, issues, privatePages, durationMs: Date.now() - started }
}
