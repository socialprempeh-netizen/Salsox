/**
 * What makes a complaint the writer pulled from a page worth keeping as a
 * lead, decided without trusting the writer:
 *
 *  - the quote must appear, word for word, in the page it came from, so a
 *    lead never carries a sentence the reviewer did not write;
 *  - a review must be rated 1 or 2 stars (forum posts and comments, from
 *    Reddit or Hacker News, have no rating);
 *  - the complaint must have a fix in the catalogue (fixes.ts).
 *
 * `sourceKey` names a complaint for good, so the same review found again next
 * week is recognised and never contacted twice.
 */
import { createHash } from "node:crypto"
import type { Complaint, Fix } from "./fixes"
import { fixFor } from "./fixes"
import { REVIEW_SOURCES, type LeadSource } from "./sources"

/** Shortest quote kept: anything shorter is too thin to write an email around. */
export const MIN_QUOTE = 25
/** Longest quote stored. */
export const MAX_QUOTE = 600

/**
 * Lowercased, quotation marks and Markdown marks dropped, dashes made plain,
 * whitespace collapsed. Quotation marks go entirely (both sides lose them the
 * same way): a quote copied without the reviewer's own quote marks is still
 * their words.
 */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/["'‘’‛“”‟]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

/** Whether `quote` is in `source` as written (ignoring case, spacing and Markdown marks). */
export function quoteAppearsIn(quote: string, source: string): boolean {
  const q = normalise(quote)
  return q.length >= MIN_QUOTE && normalise(source).includes(q)
}

export function sourceKey(source: LeadSource, competitorId: string, reviewId: string | null, quote: string): string {
  if (reviewId?.trim()) return `${source}:${competitorId}:${reviewId.trim().slice(0, 120)}`
  return `${source}:${competitorId}:${createHash("sha256").update(normalise(quote)).digest("hex").slice(0, 20)}`
}

export type CandidateSignal = { rating: number | null; quote: string; complaint: Complaint }

/** Why a candidate is not kept, or null when it is. */
export function rejection(signal: CandidateSignal, { source, page, catalogue }: { source: LeadSource; page: string; catalogue: Fix[] }): "rating" | "quote" | "noFix" | null {
  // Was source !== "reddit": every source but the review sites is unrated, Hacker News included.
  if ((REVIEW_SOURCES as readonly string[]).includes(source) && !(signal.rating === 1 || signal.rating === 2)) return "rating"
  if (signal.quote.length > MAX_QUOTE || !quoteAppearsIn(signal.quote, page)) return "quote"
  if (!fixFor(signal.complaint, catalogue)) return "noFix"
  return null
}
