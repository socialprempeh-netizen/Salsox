/**
 * When the outreach agent sends by itself and when it waits for a person:
 * the trust gate, the follow-up timing and the daily cap.
 *
 * Trust gate: the first REVIEW_FIRST emails always wait for approval, the
 * same rule as the SEO agent's first articles (src/lib/seo-agent/policy.ts).
 * After that each email sends itself, unless "review every email" is on or
 * sending is paused. The count is of emails sent, by hand or not, so
 * discarding drafts does not end the trial early.
 *
 * Follow-up: one, FOLLOW_UP_AFTER_DAYS after the first email, only when the
 * lead has not replied or unsubscribed. Never a second.
 *
 * Daily cap: at most `dailyCap` emails a day across first emails and
 * follow-ups, to keep a new sending domain's reputation intact.
 */

export const REVIEW_FIRST = 5
export const FOLLOW_UP_AFTER_DAYS = 3
export const DEFAULT_DAILY_CAP = 20
export const MAX_DAILY_CAP = 100

const DAY = 24 * 60 * 60 * 1000

export function shouldAutoSend({ sentBefore, reviewEvery, paused }: { sentBefore: number; reviewEvery: boolean; paused: boolean }): boolean {
  return !paused && !reviewEvery && sentBefore >= REVIEW_FIRST
}

/** How many more emails wait for approval before auto-send starts. */
export function reviewsLeft(sent: number): number {
  return Math.max(0, REVIEW_FIRST - sent)
}

export function followUpDue({ firstSentAt, hasFollowUp, replied, unsubscribed, now }: { firstSentAt: Date | null; hasFollowUp: boolean; replied: boolean; unsubscribed: boolean; now: Date }): boolean {
  if (!firstSentAt || hasFollowUp || replied || unsubscribed) return false
  return now.getTime() - firstSentAt.getTime() >= FOLLOW_UP_AFTER_DAYS * DAY
}

/** The moment before which a first email is old enough for its follow-up. */
export function followUpCutoff(now: Date): Date {
  return new Date(now.getTime() - FOLLOW_UP_AFTER_DAYS * DAY)
}

/** Emails left to send today. */
export function remainingToday(dailyCap: number, sentToday: number): number {
  return Math.max(0, clampCap(dailyCap) - sentToday)
}

export function clampCap(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_CAP
  return Math.min(MAX_DAILY_CAP, Math.max(1, Math.floor(value)))
}

/** Midnight UTC of `now`'s day: the start of "today" for the cap. */
export function startOfDayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
