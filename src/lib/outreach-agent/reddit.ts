/**
 * Reddit, through its official Data API (an app-only OAuth token), not by
 * crawling: reddit.com's robots.txt turns crawlers away and its terms require
 * the API for automated access. The Hunter searches chosen communities for
 * posts about a named e-signature tool's pricing, limits or support, and
 * reads comments too: the newest in those communities, and the threads under
 * the posts it found.
 *
 * Settings: REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET, from a "script" or
 * "web" app at reddit.com/prefs/apps (the client_credentials grant needs an
 * app that holds a secret; an "installed" app has none). Reddit asks every
 * client to send a descriptive User-Agent, which the caller passes.
 * Credentials are only ever sent to Reddit's token endpoint, never logged.
 *
 * A Reddit lead has a username, never an address: it waits in the Needs
 * contact queue like any other until an admin adds one, or is answered on
 * Reddit by hand from its link. Nothing here posts, votes or messages.
 *
 * Read-only, and light on the API: one token, then one request per search,
 * one for the comment feed and one per thread opened, well inside Reddit's
 * 100 requests a minute. The parsers are pure and tested (reddit.test.ts).
 */
import type { ForumItem } from "./forum"

/** A post's id is Reddit's own; a comment's is its fullname ("t1_…"), so the two never collide in a lead's key. */
export type RedditPost = ForumItem

/** Longest text kept per post or comment. */
const MAX_TEXT = 4_000

/** Authors whose words are never a lead: deleted accounts and the moderation bot. */
const NOT_A_PERSON = new Set(["[deleted]", "AutoModerator"])

export function redditConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.REDDIT_CLIENT_ID?.trim() && env.REDDIT_CLIENT_SECRET?.trim())
}

const createdAt = (d: Record<string, unknown>) => new Date((typeof d.created_utc === "number" ? d.created_utc : 0) * 1000)

/** The posts in a /search listing, without removed or deleted ones. */
export function parseListing(json: unknown): RedditPost[] {
  const children = (json as { data?: { children?: unknown } } | null)?.data?.children
  if (!Array.isArray(children)) return []
  const posts: RedditPost[] = []
  for (const child of children) {
    const d = (child as { kind?: string; data?: Record<string, unknown> }).data
    if ((child as { kind?: string }).kind !== "t3" || !d) continue
    const author = typeof d.author === "string" ? d.author : ""
    const text = typeof d.selftext === "string" ? d.selftext : ""
    if (!author || NOT_A_PERSON.has(author) || text === "[removed]" || text === "[deleted]") continue
    if (typeof d.id !== "string" || typeof d.title !== "string" || typeof d.permalink !== "string") continue
    posts.push({ kind: "post", id: d.id, title: d.title, text: text.slice(0, MAX_TEXT), author, url: `https://www.reddit.com${d.permalink}`, createdAt: createdAt(d) })
  }
  return posts
}

/**
 * The comments in a listing, replies included, without removed, deleted,
 * bot or moderator ones. Reads both a subreddit's /comments feed (each
 * comment carries its thread's link_title) and a thread's comment tree
 * (where `threadTitle` is passed in, and replies nest).
 */
export function parseComments(json: unknown, threadTitle?: string): RedditPost[] {
  const comments: RedditPost[] = []
  const walk = (listing: unknown) => {
    const children = (listing as { data?: { children?: unknown } } | null)?.data?.children
    if (!Array.isArray(children)) return
    for (const child of children) {
      const d = (child as { kind?: string; data?: Record<string, unknown> }).data
      if ((child as { kind?: string }).kind !== "t1" || !d) continue
      // Replies are walked even when their parent is dropped.
      if (d.replies && typeof d.replies === "object") walk(d.replies)
      const author = typeof d.author === "string" ? d.author : ""
      const body = typeof d.body === "string" ? d.body : ""
      if (!author || NOT_A_PERSON.has(author) || !body.trim() || body === "[removed]" || body === "[deleted]" || d.distinguished === "moderator") continue
      const title = threadTitle ?? (typeof d.link_title === "string" ? d.link_title : "")
      if (typeof d.id !== "string" || typeof d.permalink !== "string" || !title) continue
      comments.push({ kind: "comment", id: `t1_${d.id}`, title, text: body.slice(0, MAX_TEXT), author, url: `https://www.reddit.com${d.permalink}`, createdAt: createdAt(d) })
    }
  }
  walk(json)
  return comments
}

/** A thread's comments, from /comments/<id>: the second listing of the pair. */
export function parseThread(json: unknown, threadTitle: string): RedditPost[] {
  return Array.isArray(json) ? parseComments(json[1], threadTitle) : []
}

// redditCandidates moved to forum.ts as forumCandidates, shared with Hacker News.

/** "a+b+c", the multireddit path that searches several communities in one request. */
export function multireddit(subreddits: readonly string[]): string {
  return subreddits.map((s) => s.trim().replace(/^r\//i, "")).filter((s) => /^[A-Za-z0-9_]{2,21}$/.test(s)).join("+")
}

async function appToken(userAgent: string, env: Record<string, string | undefined>): Promise<string> {
  const id = env.REDDIT_CLIENT_ID?.trim()
  const secret = env.REDDIT_CLIENT_SECRET?.trim()
  if (!id || !secret) throw new Error("REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET are not set")
  const response = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded", "user-agent": userAgent },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok) throw new Error(`Reddit refused the app credentials (HTTP ${response.status})`)
  const json = (await response.json()) as { access_token?: string }
  if (!json.access_token) throw new Error("Reddit returned no access token")
  return json.access_token
}

export type RedditReader = {
  /** Recent posts (past week) for each query inside `subreddits`, de-duplicated by id. */
  search(queries: string[], subreddits: readonly string[]): Promise<RedditPost[]>
  /** The newest comments across `subreddits`. */
  recentComments(subreddits: readonly string[]): Promise<RedditPost[]>
  /** The comments under one post. */
  thread(post: RedditPost): Promise<RedditPost[]>
}

/** One app token, then the reads the Hunter makes with it. */
export async function redditReader({ userAgent, env = process.env }: { userAgent: string; env?: Record<string, string | undefined> }): Promise<RedditReader> {
  const token = await appToken(userAgent, env)
  const get = async (path: string, params: Record<string, string>, what: string) => {
    const response = await fetch(`https://oauth.reddit.com${path}?${new URLSearchParams({ raw_json: "1", ...params })}`, { headers: { authorization: `Bearer ${token}`, "user-agent": userAgent }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Reddit ${what} failed (HTTP ${response.status})`)
    return response.json() as Promise<unknown>
  }
  return {
    async search(queries, subreddits) {
      const seen = new Map<string, RedditPost>()
      for (const q of queries) {
        const json = await get(`/r/${multireddit(subreddits)}/search`, { q, restrict_sr: "1", sort: "new", t: "week", limit: "25", type: "link" }, "search")
        for (const post of parseListing(json)) seen.set(post.id, post)
      }
      return [...seen.values()]
    },
    async recentComments(subreddits) {
      return parseComments(await get(`/r/${multireddit(subreddits)}/comments`, { limit: "100" }, "comment feed"))
    },
    async thread(post) {
      return parseThread(await get(`/comments/${post.id}`, { limit: "100", depth: "4", sort: "top" }, "thread"), post.title)
    },
  }
}

// Was searchReddit(queries, { userAgent, env }): site-wide post search, a
// token per call. Replaced by redditReader, which searches chosen
// communities and reads comments as well, on one token.
// export async function searchReddit(queries: string[], { userAgent, env = process.env }: { userAgent: string; env?: Record<string, string | undefined> }): Promise<RedditPost[]> {
//   const token = await appToken(userAgent, env)
//   const seen = new Map<string, RedditPost>()
//   for (const q of queries) {
//     const url = `https://oauth.reddit.com/search?${new URLSearchParams({ q, sort: "new", t: "week", limit: "25", type: "link" })}`
//     const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, "user-agent": userAgent }, signal: AbortSignal.timeout(20_000) })
//     if (!response.ok) throw new Error(`Reddit search failed (HTTP ${response.status})`)
//     for (const post of parseListing(await response.json())) seen.set(post.id, post)
//   }
//   return [...seen.values()]
// }
