/**
 * Reads a competitor's published pages (pricing, plans) as plain text on the
 * day a comparison is written, so every fact about them in the page comes
 * from what they publish now and the page can say when it was checked. And,
 * for the law pages, reads the official text of each statute whole (HTML,
 * or a Word file where that is the only readable form), so law-verify.ts
 * can confirm the facts a law page rests on are still in it.
 *
 * A page that cannot be read (blocked, rendered only by JavaScript, too
 * short to hold any facts) is reported as unreadable, and a comparison with
 * no readable source is not written: the required-data gate in
 * page-agent.ts stops it rather than letting the writer fill the gap.
 */

/** Below this many words a page holds no usable facts (a bot wall, an empty JS shell). */
export const MIN_SOURCE_WORDS = 150
/** Enough of a pricing page to hold its plans, small enough to keep the prompt short. */
export const MAX_SOURCE_CHARS = 14_000

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&euro;": "€", "&pound;": "£" }

/** Visible text of an HTML page: scripts, styles and markup removed, entities decoded, whitespace collapsed. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp|euro|pound);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t\f\v\r]+/g, " ")
    .replace(/\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim()
}

export type FetchedSource = { label: string; url: string; text: string; ok: boolean; reason?: string }

export async function fetchSource(source: { label: string; url: string }, fetcher: typeof fetch = fetch): Promise<FetchedSource> {
  try {
    const response = await fetcher(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; content-check; +https://schema.org)", Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) return { ...source, text: "", ok: false, reason: `HTTP ${response.status}` }
    const text = htmlToText(await response.text()).slice(0, MAX_SOURCE_CHARS)
    const words = text.split(/\s+/).filter(Boolean).length
    if (words < MIN_SOURCE_WORDS) return { ...source, text, ok: false, reason: `only ${words} readable words` }
    return { ...source, text, ok: true }
  } catch (error) {
    return { ...source, text: "", ok: false, reason: error instanceof Error ? error.message.slice(0, 120) : "unreadable" }
  }
}

// ── Whole documents, for verifying law (law-verify.ts) ──────────────────────

/**
 * The text of a Word 97 (.doc) file, read straight from its bytes: the
 * format stores text uncompressed, as 8-bit or UTF-16 runs, so decoding the
 * bytes both ways and keeping the readable characters recovers it. Good
 * enough to find a sentence in it, which is all it is used for.
 */
export function docText(bytes: Uint8Array): string {
  const buffer = Buffer.from(bytes)
  const eight = buffer.toString("latin1").replace(/[^\x20-\x7e\n\r\xa0-\xff]+/g, " ")
  const wide = buffer.toString("utf16le").replace(/[^\x20-\x7e\n\r\xa0-\xff]+/g, " ")
  return `${eight}\n${wide}`.replace(/[ \t]+/g, " ")
}

/** The text of a .docx file: its main document part, with the markup removed. */
export async function docxText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import("jszip")
  const xml = await (await JSZip.loadAsync(bytes)).file("word/document.xml")?.async("string")
  if (!xml) return ""
  return htmlToText(xml.replace(/<\/w:p>/g, "</p>").replace(/<w:tab\/>/g, " "))
}

export type FullText = { ok: boolean; text: string; reason?: string }

/**
 * The floor for a whole statute text. Lower than MIN_SOURCE_WORDS: one
 * section of the German Civil Code is a few dozen words, and what proves a
 * law text was really read is that the quoted passages are found in it
 * (law-verify.ts), not its length. This only catches an empty shell.
 */
export const MIN_LAW_WORDS = 25

/**
 * An HTML page's text in the charset it declares. German statute pages
 * (gesetze-im-internet.de) are ISO-8859-1; read as UTF-8, as response.text()
 * always does, every umlaut became a replacement character, so a quoted
 * passage with an umlaut could never be found. Was: htmlToText(await response.text()).
 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 2048))
  const declared = /charset=["']?([\w-]+)/i.exec(contentType ?? "")?.[1] ?? /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ?? "utf-8"
  try {
    return new TextDecoder(declared.toLowerCase()).decode(bytes)
  } catch {
    return new TextDecoder("utf-8").decode(bytes)
  }
}

/**
 * Why a fetch threw, in words a person can act on. Node's fetch reports every
 * network failure as "fetch failed" and keeps the real reason (a reset
 * connection, a refused TLS handshake, a DNS miss, a timeout) in `cause`,
 * which the run log used to drop.
 */
export function fetchErrorReason(error: unknown): string {
  if (!(error instanceof Error)) return "unreadable"
  const cause = error.cause as { code?: string; message?: string } | undefined
  const detail = cause?.code ?? cause?.message
  return (error.name === "TimeoutError" ? "timed out after 30 seconds" : detail && !error.message.includes(detail) ? `${error.message} (${detail})` : error.message).slice(0, 160)
}

async function fetchFullTextOnce(source: { url: string; format?: "html" | "doc" | "docx" }, fetcher: typeof fetch): Promise<FullText & { retry?: boolean }> {
  try {
    const response = await fetcher(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; content-check; +https://schema.org)" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return { ok: false, text: "", reason: `HTTP ${response.status}`, retry: response.status === 429 || response.status >= 500 }
    const bytes = new Uint8Array(await response.arrayBuffer())
    const text = source.format === "doc" ? docText(bytes) : source.format === "docx" ? await docxText(bytes) : htmlToText(decodeHtml(bytes, response.headers.get("content-type")))
    const words = text.split(/\s+/).filter(Boolean).length
    if (words < MIN_LAW_WORDS) return { ok: false, text, reason: `only ${words} readable words` }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, text: "", reason: fetchErrorReason(error), retry: true }
  }
}

/**
 * A source's whole text (never truncated), as HTML, .doc or .docx by its
 * `format`. A network error, a timeout, a 429 or a 5xx is tried once more
 * after a pause; if the page still cannot be read directly and `viaCrawler`
 * is given (the site's own Crawl4AI service, which reads from a different
 * network), the same official page is read through it. The text always comes
 * from the source's own URL; only the route to it changes.
 */
export async function fetchFullText(
  source: { url: string; format?: "html" | "doc" | "docx" },
  fetcher: typeof fetch = fetch,
  { viaCrawler, retryAfterMs = 2_000 }: { viaCrawler?: (url: string) => Promise<string | null>; retryAfterMs?: number } = {}
): Promise<FullText> {
  let result = await fetchFullTextOnce(source, fetcher)
  if (!result.ok && result.retry) {
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs))
    result = await fetchFullTextOnce(source, fetcher)
  }
  if (result.ok || !viaCrawler || (source.format && source.format !== "html")) return { ok: result.ok, text: result.text, reason: result.reason }
  const crawled = await viaCrawler(source.url).catch(() => null)
  const words = crawled?.split(/\s+/).filter(Boolean).length ?? 0
  if (crawled && words >= MIN_LAW_WORDS) return { ok: true, text: crawled }
  return { ok: false, text: "", reason: `${result.reason}; through the crawler: ${crawled === null ? "not readable" : `only ${words} readable words`}` }
}
