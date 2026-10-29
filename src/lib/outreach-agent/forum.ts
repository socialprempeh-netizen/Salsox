/**
 * What the Hunter's discussion sources share: a forum post or comment, and
 * the rule for which ones are worth a model call. Reddit (reddit.ts, waiting
 * on API approval) and Hacker News (hackernews.ts) both hand their results
 * over in this shape, so the tool-mention and pain-topic rules (sources.ts)
 * are applied in one place. Pure, tested in forum.test.ts.
 *
 * Moved here from reddit.ts (where it was redditCandidates) when Hacker News
 * became the second source using it.
 */
import { FORUM_COMPETITORS, competitorIn, painIn, type Competitor } from "./sources"

export type ForumItem = {
  kind: "post" | "comment"
  /** Unique within its site, and stable: it becomes part of the lead's key. */
  id: string
  /** The thread's title (for a comment, the post it was left under). */
  title: string
  text: string
  author: string
  url: string
  createdAt: Date
}

/**
 * What is worth a model call, newest first, at most `max`: a post that names
 * exactly one of the tools, or a comment that touches a pain point and names
 * one (itself, or failing that its thread's title, as in "their pricing is
 * absurd" under "Anyone else leaving DocuSign?"). Anything already known
 * (`known`, by competitor and item) is left out.
 *
 * `painIn: "all"` asks the pain-point test of posts too, for a source whose
 * search finds every mention of a tool (Hacker News) rather than only the
 * complaints (Reddit's search already carried the pain words).
 */
export function forumCandidates(
  items: ForumItem[],
  { competitors = FORUM_COMPETITORS, known = () => false, max, pain = "comments" }: { competitors?: Competitor[]; known?: (competitor: Competitor, item: ForumItem) => boolean; max: number; pain?: "comments" | "all" }
): { item: ForumItem; competitor: Competitor }[] {
  const picked = new Map<string, { item: ForumItem; competitor: Competitor }>()
  for (const item of items) {
    const competitor =
      item.kind === "post"
        ? pain === "all" && !painIn(`${item.title}\n${item.text}`).length
          ? null
          : competitorIn(`${item.title}\n${item.text}`, competitors)
        : painIn(item.text).length
          ? (competitorIn(item.text, competitors) ?? competitorIn(item.title, competitors))
          : null
    if (competitor && !known(competitor, item)) picked.set(item.id, { item, competitor })
  }
  return [...picked.values()].sort((a, b) => b.item.createdAt.getTime() - a.item.createdAt.getTime()).slice(0, max)
}
