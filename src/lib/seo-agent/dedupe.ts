/**
 * Whether a keyword is already covered, so the agent never writes a second
 * page for an intent the site already answers: two pages chasing one query
 * split its ranking between them.
 *
 * "Covered" is checked against phrases: every keyword the agent has picked
 * before (whatever happened to its article), and the titles, headings and
 * target keywords of the blog posts, landing, tool and comparison pages and
 * templates. A phrase covers a keyword when, after dropping filler words and
 * plural endings:
 *  - they are the same, or
 *  - every word of the keyword appears in the phrase ("sign pdf" is covered by
 *    "How to sign a PDF"), or
 *  - they overlap heavily (Jaccard similarity of 0.7 or more), which catches
 *    reorderings and one-word differences on both sides.
 *
 * A longer query that adds a real word ("sign pdf on iphone") is not covered
 * by the shorter page: it is a narrower intent and can earn its own article.
 */

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from how i in is it my of on or the to what when where which who why with you your vs versus".split(" ")
)

/** A keyword's meaningful words: lower case, filler dropped, crude singular. */
export function keywordTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !STOP_WORDS.has(w))
    // Plural to singular, the common cases only: "signatures" and "signature"
    // are one intent; "process" keeps its double s.
    .map((w) => (w.length > 3 && w.endsWith("ies") ? `${w.slice(0, -3)}y` : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w))
  return new Set(words)
}

export const COVERAGE_JACCARD = 0.7

export function covers(phrase: string, keyword: string): boolean {
  const k = keywordTokens(keyword)
  const p = keywordTokens(phrase)
  if (k.size === 0 || p.size === 0) return false
  let shared = 0
  for (const w of k) if (p.has(w)) shared++
  if (shared === k.size) return true
  return shared / (k.size + p.size - shared) >= COVERAGE_JACCARD
}

/** The first phrase that covers `keyword`, or null when it is untargeted. */
export function coveredBy(keyword: string, phrases: string[]): string | null {
  return phrases.find((phrase) => covers(phrase, keyword)) ?? null
}

/** The best candidate (they arrive ranked) no phrase covers yet. */
export function pickUntargeted<T extends { query: string }>(ranked: T[], phrases: string[]): T | null {
  return ranked.find((candidate) => coveredBy(candidate.query, phrases) === null) ?? null
}
