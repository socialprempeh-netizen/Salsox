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
 */

export const REVIEW_FIRST = 3

export function shouldAutoPublish({ writtenBefore, draftFirst }: { writtenBefore: number; draftFirst: boolean }): boolean {
  return !draftFirst && writtenBefore >= REVIEW_FIRST
}

/** How many more articles will wait for review before auto-publish starts. */
export function reviewsLeft(written: number): number {
  return Math.max(0, REVIEW_FIRST - written)
}
