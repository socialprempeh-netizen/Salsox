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
 * Internal links are checked too (`checkLinks`): every same-site link on the
 * crawled pages that is not itself a sitemap URL is requested once, and a
 * target that answers 404 (or any error) is reported once, with the pages
 * that link to it. A link to a permanent redirect is a warning: it works, but
 * it spends a hop and points at an address the site has moved away from.
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
  /** Internal link targets requested beyond the sitemap, and how many failed. */
  links: { checked: number; broken: number }
  durationMs: number
}

/** How many linking pages an issue names before summarising the rest. */
const MAX_SOURCES = 3

/**
 * Requests every internal link target on `pages` that the crawl has not
 * already fetched (`known`, pathnames) and reports the broken ones, one issue
 * per target. HEAD first; a route that does not answer HEAD is asked again
 * with GET, so a 405 is never mistaken for a broken link.
 */
export async function checkLinks(options: {
  pages: PageFacts[]
  known: Set<string>
  origin: string
  fetchImpl: typeof fetch
  concurrency: number
  timeoutMs: number
}): Promise<{ issues: Issue[]; checked: number; broken: number }> {
  const sources = new Map<string, string[]>()
  for (const page of options.pages) {
    if (page.status !== 200) continue
    for (const link of page.internalLinks) {
      if (options.known.has(link)) continue
      sources.set(link, [...(sources.get(link) ?? []), page.url])
    }
  }
  const request = async (path: string, method: "HEAD" | "GET") => {
    try {
      return await options.fetchImpl(new URL(path, options.origin).toString(), { method, redirect: "manual", signal: AbortSignal.timeout(options.timeoutMs), headers: { "user-agent": "SalsoxSEOAudit/1.0" } })
    } catch {
      return null
    }
  }
  const targets = [...sources.keys()]
  const results = await pool(targets, options.concurrency, async (path) => {
    let res = await request(path, "HEAD")
    if (res && (res.status === 405 || res.status === 501)) res = await request(path, "GET")
    return { path, status: res?.status ?? 0, location: res?.headers.get("location") ?? null }
  })

  const issues: Issue[] = []
  const from = (path: string) => {
    const list = sources.get(path) ?? []
    const named = list.slice(0, MAX_SOURCES).map((u) => new URL(u).pathname).join(", ")
    return list.length > MAX_SOURCES ? `${named} and ${list.length - MAX_SOURCES} more` : named
  }
  for (const r of results) {
    if (r.status === 0 || r.status >= 400) {
      issues.push({ url: r.path, severity: "error", message: `broken link: answers ${r.status || "nothing"}; linked from ${from(r.path)}` })
    } else if (r.status === 301 || r.status === 308) {
      issues.push({ url: r.path, severity: "warning", message: `link to a permanent redirect${r.location ? ` (to ${r.location})` : ""}; linked from ${from(r.path)}` })
    }
  }
  return { issues, checked: targets.length, broken: issues.filter((i) => i.severity === "error").length }
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

  // Sitemap URLs were fetched above and already reported if they fail.
  const known = new Set(options.sitemapUrls.map((u) => new URL(u).pathname))
  const links = await checkLinks({ pages, known, origin: options.origin, fetchImpl, concurrency: options.concurrency ?? 6, timeoutMs: timeout })
  issues.push(...links.issues)

  return { pages, issues, privatePages, links: { checked: links.checked, broken: links.broken }, durationMs: Date.now() - started }
}
