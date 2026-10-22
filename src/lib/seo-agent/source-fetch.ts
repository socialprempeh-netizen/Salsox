/**
 * Reads a competitor's published pages (pricing, plans) as plain text on the
 * day a comparison is written, so every fact about them in the page comes
 * from what they publish now and the page can say when it was checked.
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
