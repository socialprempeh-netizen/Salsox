/**
 * When an article the agent wrote goes live by itself, and when it waits for
 * a person.
 *
 * The first REVIEW_FIRST articles are always drafts: a new writer's first
 * pieces are read before they are published. After that each article
 * publishes itself unless "draft first" is switched on in the admin tab, which
 * puts every article back behind a review. The count is of every article
 * written, discarded ones included, so discarding drafts does not extend the
 * trial forever.
 *
 * The page mode (page-agent.ts) uses the same rule and the same setting,
 * counting the pages it wrote instead; a page flagged as a near-duplicate
 * never publishes itself, whatever the count.
 */

export const REVIEW_FIRST = 3

export function shouldAutoPublish({ writtenBefore, draftFirst }: { writtenBefore: number; draftFirst: boolean }): boolean {
  return !draftFirst && writtenBefore >= REVIEW_FIRST
}

/** How many more articles will wait for review before auto-publish starts. */
export function reviewsLeft(written: number): number {
  return Math.max(0, REVIEW_FIRST - written)
}

/**
 * What the daily run writes. "pages" (the default) is the page mode
 * (page-agent.ts): templates, comparisons and law pages, the page types with
 * conversion data behind them. "articles" is the original mode, a blog
 * article for a Search Console query with impressions but no clicks; it was
 * switched off because those articles brought visits that did not convert,
 * and is kept, not deleted, so it can be turned back on with
 * SEO_AGENT_MODE=articles. Articles it already published stay live.
 */
export type DailyMode = "pages" | "articles"

export function dailyMode(env: Record<string, string | undefined> = process.env): DailyMode {
  return env.SEO_AGENT_MODE?.trim().toLowerCase() === "articles" ? "articles" : "pages"
}
