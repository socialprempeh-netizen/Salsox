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

/** A source's whole text (never truncated), as HTML, .doc or .docx by its `format`. */
export async function fetchFullText(source: { url: string; format?: "html" | "doc" | "docx" }, fetcher: typeof fetch = fetch): Promise<FullText> {
  try {
    const response = await fetcher(source.url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; content-check; +https://schema.org)" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    })
    if (!response.ok) return { ok: false, text: "", reason: `HTTP ${response.status}` }
    const text =
      source.format === "doc"
        ? docText(new Uint8Array(await response.arrayBuffer()))
        : source.format === "docx"
          ? await docxText(new Uint8Array(await response.arrayBuffer()))
          : htmlToText(await response.text())
    const words = text.split(/\s+/).filter(Boolean).length
    if (words < MIN_LAW_WORDS) return { ok: false, text, reason: `only ${words} readable words` }
    return { ok: true, text }
  } catch (error) {
    return { ok: false, text: "", reason: error instanceof Error ? error.message.slice(0, 120) : "unreadable" }
  }
}
