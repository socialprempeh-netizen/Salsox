/**
 * Hacker News, through its public search API (hn.algolia.com/api, run by
 * Algolia for HN): read-only, no key, and no robots.txt standing in the way.
 * The Hunter searches recent stories and comments for each tool by name; the
 * search is fuzzy (a query for "docusign" also finds "design"), so every hit
 * is then held to the same tool-mention and pain-topic rules as Reddit
 * (forum.ts), and its quote to the same word-for-word check (signals.ts).
 *
 * Nothing here posts, votes or replies. HN profiles rarely show an address,
 * so a lead from here waits in the Needs contact queue like any other.
 *
 * Light on the API: one request per search term per hunt (Algolia allows
 * 10,000 an hour per IP), one at a time. The parsers are pure and tested
 * (hackernews.test.ts).
 */
import type { ForumItem } from "./forum"
import { FORUM_COMPETITORS, type Competitor } from "./sources"

const API = "https://hn.algolia.com/api/v1/search_by_date"

/** How far back a hunt looks. Hunts run twice a week; known items are skipped, so the overlap costs nothing. */
export const LOOKBACK_DAYS = 30
/** Hits read per search term: more than a month of mentions for any of the three tools. */
export const HITS_PER_TERM = 100
/** Longest text kept per story or comment. */
const MAX_TEXT = 4_000

/** The words each tool is searched under on HN. Dropbox Sign is still often called HelloSign. */
export function hnSearchTerms(competitors: Competitor[] = FORUM_COMPETITORS): string[] {
  return competitors.flatMap((c) => (c.id === "dropbox-sign" ? [c.name, "HelloSign"] : [c.name]))
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

/**
 * HN's comment HTML as plain text: paragraphs as blank lines, links as their
 * text, entities decoded. The quote check compares against this, so a quote
 * the model copies from the text is found here as written.
 */
export function hnText(html: string): string {
  return html
    .replace(/<p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === "#") {
        const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole
      }
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

/** The stories and comments in a search answer, without deleted or empty ones. */
export function parseHits(json: unknown): ForumItem[] {
  const hits = (json as { hits?: unknown } | null)?.hits
  if (!Array.isArray(hits)) return []
  const items: ForumItem[] = []
  for (const hit of hits as Record<string, unknown>[]) {
    const tags = Array.isArray(hit._tags) ? (hit._tags as unknown[]) : []
    const id = typeof hit.objectID === "string" ? hit.objectID : ""
    const author = typeof hit.author === "string" ? hit.author : ""
    if (!/^\d+$/.test(id) || !author) continue
    const createdAt = new Date((typeof hit.created_at_i === "number" ? hit.created_at_i : 0) * 1000)
    const url = `https://news.ycombinator.com/item?id=${id}`
    if (tags.includes("comment")) {
      const text = hnText(typeof hit.comment_text === "string" ? hit.comment_text : "")
      if (!text) continue
      items.push({ kind: "comment", id, title: typeof hit.story_title === "string" ? hit.story_title : "", text: text.slice(0, MAX_TEXT), author, url, createdAt })
    } else if (tags.includes("story")) {
      const title = typeof hit.title === "string" ? hit.title : ""
      const text = hnText(typeof hit.story_text === "string" ? hit.story_text : "")
      // A link with no text is someone else's article, and a Show HN is a
      // launch (often of a rival "alternative"): neither is a user complaining.
      // Their comment threads are still searched.
      if (!title || !text || /^show hn\b/i.test(title)) continue
      items.push({ kind: "post", id, title, text: text.slice(0, MAX_TEXT), author, url, createdAt })
    }
  }
  return items
}

/** Recent stories and comments for each term, de-duplicated by id. Throws when the API cannot be read. */
export async function searchHackerNews({ userAgent, terms = hnSearchTerms(), now = new Date(), days = LOOKBACK_DAYS }: { userAgent: string; terms?: string[]; now?: Date; days?: number }): Promise<ForumItem[]> {
  const since = Math.floor(now.getTime() / 1000) - days * 86_400
  const seen = new Map<string, ForumItem>()
  for (const query of terms) {
    const params = new URLSearchParams({ query, tags: "(story,comment)", numericFilters: `created_at_i>${since}`, hitsPerPage: String(HITS_PER_TERM) })
    const response = await fetch(`${API}?${params}`, { headers: { "user-agent": userAgent }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Hacker News search failed (HTTP ${response.status})`)
    for (const item of parseHits(await response.json())) seen.set(item.id, item)
  }
  return [...seen.values()]
}
