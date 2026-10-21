/**
 * The Hunter's reader: asks a self-hosted Crawl4AI server (docs.crawl4ai.com,
 * Docker image) for review pages as Markdown, which the writer then reads for
 * complaints. Crawl4AI renders the page in a real browser, so review sites
 * that build their lists in JavaScript still come back as text.
 *
 * Settings: CRAWL4AI_URL (the server's base URL) and CRAWL4AI_API_TOKEN (its
 * bearer token, when the server has one). The token is sent as a header and
 * never logged. Pages are asked for with the server's own robots.txt check on
 * as well, on top of the check robots.ts makes before a URL is ever sent here.
 *
 * Only `parseCrawlResponse` decides anything, and it is pure: the response
 * shape has changed between Crawl4AI releases (markdown as a string, then as
 * an object with raw and fit variants), so both are read.
 */

export type CrawledPage = { url: string; ok: boolean; status: number | null; markdown: string; error: string | null }

/** Longest Markdown handed on per page: a review page's text, not its whole DOM. */
export const MAX_MARKDOWN = 60_000

type RawResult = {
  url?: unknown
  success?: unknown
  status_code?: unknown
  error_message?: unknown
  markdown?: unknown
}

function markdownOf(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object") {
    const m = value as { fit_markdown?: unknown; raw_markdown?: unknown; markdown_with_citations?: unknown }
    // fit_markdown has navigation and boilerplate stripped; raw when it is empty.
    for (const candidate of [m.fit_markdown, m.raw_markdown, m.markdown_with_citations]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate
    }
  }
  return ""
}

/** The pages in a POST /crawl answer, whatever version of the server sent it. */
export function parseCrawlResponse(json: unknown): CrawledPage[] {
  const results = (json && typeof json === "object" && Array.isArray((json as { results?: unknown }).results) ? (json as { results: RawResult[] }).results : []) as RawResult[]
  return results.map((r) => {
    const markdown = markdownOf(r.markdown).slice(0, MAX_MARKDOWN)
    const status = typeof r.status_code === "number" ? r.status_code : null
    const ok = r.success !== false && markdown.trim().length > 0 && (status === null || status < 400)
    const error = ok ? null : typeof r.error_message === "string" && r.error_message ? r.error_message.slice(0, 300) : status ? `HTTP ${status}` : "no text came back"
    return { url: typeof r.url === "string" ? r.url : "", ok, status, markdown, error }
  })
}

export function crawlerConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.CRAWL4AI_URL?.trim())
}

/** Fetches pages through Crawl4AI. Throws only when the server cannot be reached at all. */
export async function crawlPages(urls: string[], { userAgent, env = process.env }: { userAgent: string; env?: Record<string, string | undefined> }): Promise<CrawledPage[]> {
  const base = env.CRAWL4AI_URL?.trim().replace(/\/$/, "")
  if (!base) throw new Error("CRAWL4AI_URL is not set")
  if (urls.length === 0) return []
  const token = env.CRAWL4AI_API_TOKEN?.trim()
  const response = await fetch(`${base}/crawl`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      urls,
      browser_config: { type: "BrowserConfig", params: { headless: true, user_agent: userAgent } },
      crawler_config: { type: "CrawlerRunConfig", params: { stream: false, cache_mode: "bypass", check_robots_txt: true, page_timeout: 60_000 } },
    }),
    signal: AbortSignal.timeout(240_000),
  })
  if (!response.ok) throw new Error(`the Crawl4AI server answered HTTP ${response.status}`)
  return parseCrawlResponse(await response.json())
}
