/**
 * Which Search Console queries are worth an article: the scoring half of the
 * SEO agent, pure so it is tested without Google (opportunities.test.ts).
 *
 * The input is Search Console's search analytics rows for one property,
 * dimensions `query` and `page`, over the last 90 days. One query can rank
 * with several pages, so rows are first folded into one per query: clicks and
 * impressions summed, position averaged by impressions, and the page with the
 * most impressions kept as the one that already ranks.
 *
 * A query is an opportunity when people see the site for it and do not click:
 *  - impressions at or above a floor (enough demand to matter);
 *  - an average position from 11 to 50, pages two to five: Google already
 *    connects the site to the query, but nobody scrolls that far;
 *  - near-zero clicks.
 *
 * Opportunities are ranked by missed clicks: impressions times how far the
 * query's click-through rate falls below what its position normally earns
 * (`expectedCtr`). Two queries with the same impressions are told apart by
 * position, because a query on page two "should" earn more than one on page
 * five, so the gap, and the reward for closing it, is larger.
 */

export type SearchRow = { query: string; page: string; clicks: number; impressions: number; position: number }

export type QueryStats = {
  query: string
  clicks: number
  impressions: number
  /** Impression-weighted mean position, 1 is the top result. */
  position: number
  ctr: number
  /** The page with the most impressions for this query. */
  page: string | null
  /** How many of the site's pages appeared for it. */
  pages: number
}

export type Opportunity = QueryStats & {
  expectedCtr: number
  /** Clicks a page at this position normally earns that this query did not. */
  score: number
}

export type OpportunityRules = {
  minImpressions: number
  minPosition: number
  maxPosition: number
  maxClicks: number
  /** Lower-cased words that mark a query as a search for the site itself. */
  brandTerms: string[]
}

export const DEFAULT_RULES: OpportunityRules = {
  minImpressions: 50,
  minPosition: 11,
  maxPosition: 50,
  maxClicks: 1,
  brandTerms: [],
}

/**
 * Organic click-through rate by position: the commonly published first-page
 * curve (around 28% for the top result down to about 2% at tenth), then a
 * power-law decay beyond page one, about 1.6% at 11, 0.6% at 20 and 0.16% at
 * 50. Only its shape matters here: it ranks queries against each other.
 */
const PAGE_ONE = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018]

export function expectedCtr(position: number): number {
  if (!Number.isFinite(position) || position < 1) return PAGE_ONE[0]
  if (position <= 10) {
    // Interpolated between whole positions: an average of 3.4 is between third and fourth.
    const low = Math.floor(position)
    const high = Math.min(10, low + 1)
    const t = position - low
    return PAGE_ONE[low - 1] * (1 - t) + PAGE_ONE[high - 1] * t
  }
  return PAGE_ONE[9] * Math.pow(10 / position, 1.5)
}

/** Lower case, single spaces, no surrounding punctuation: how two spellings of one query compare. */
export function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "")
    .trim()
}

/** Folds query+page rows into one row per query. */
export function aggregateByQuery(rows: SearchRow[]): QueryStats[] {
  const byQuery = new Map<string, { clicks: number; impressions: number; weighted: number; pages: Map<string, number> }>()
  for (const row of rows) {
    const query = normalizeQuery(row.query)
    if (!query || !(row.impressions > 0)) continue
    const entry = byQuery.get(query) ?? { clicks: 0, impressions: 0, weighted: 0, pages: new Map<string, number>() }
    entry.clicks += row.clicks
    entry.impressions += row.impressions
    entry.weighted += row.position * row.impressions
    entry.pages.set(row.page, (entry.pages.get(row.page) ?? 0) + row.impressions)
    byQuery.set(query, entry)
  }
  return [...byQuery].map(([query, e]) => {
    const top = [...e.pages].sort((a, b) => b[1] - a[1])[0]
    return {
      query,
      clicks: e.clicks,
      impressions: e.impressions,
      position: e.weighted / e.impressions,
      ctr: e.clicks / e.impressions,
      page: top ? top[0] : null,
      pages: e.pages.size,
    }
  })
}

/**
 * Queries an article cannot be written for: a search for the site by name,
 * operators and addresses, a single character, or a pasted sentence.
 */
export function isWritableQuery(query: string, brandTerms: string[]): boolean {
  if (query.length < 3) return false
  if (/[:/@]|https?|www\.|\.com\b/.test(query)) return false
  const words = query.split(" ")
  if (words.length > 10) return false
  return !brandTerms.some((term) => term && words.some((w) => w.includes(term)))
}

export function scoreQuery(stats: QueryStats): Opportunity {
  const expected = expectedCtr(stats.position)
  const gap = Math.max(0, expected - stats.ctr)
  return { ...stats, expectedCtr: expected, score: stats.impressions * gap }
}

/** Opportunities from raw rows, best first. Ties go to the better position, then the alphabet. */
export function rankOpportunities(rows: SearchRow[], rules: OpportunityRules = DEFAULT_RULES): Opportunity[] {
  return aggregateByQuery(rows)
    .filter(
      (q) =>
        q.impressions >= rules.minImpressions &&
        q.position >= rules.minPosition &&
        q.position <= rules.maxPosition &&
        q.clicks <= rules.maxClicks &&
        isWritableQuery(q.query, rules.brandTerms)
    )
    .map(scoreQuery)
    .filter((o) => o.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position || a.query.localeCompare(b.query))
}
