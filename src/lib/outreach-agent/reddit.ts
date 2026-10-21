/**
 * Reddit, through its official Data API (an app-only OAuth token), not by
 * crawling: reddit.com's robots.txt turns crawlers away and its terms require
 * the API for automated access. The Hunter searches recent posts for people
 * asking to leave a named e-signature tool.
 *
 * Settings: REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET, from a "script" or
 * "web" app at reddit.com/prefs/apps. Reddit asks every client to send a
 * descriptive User-Agent, which the caller passes. Credentials are only ever
 * sent to Reddit's token endpoint, never logged.
 *
 * A Reddit lead has a username, never an address: it waits in the Needs
 * contact queue like any other until an admin adds one, or is answered on
 * Reddit by hand from its link.
 */

export type RedditPost = { id: string; title: string; text: string; author: string; url: string; createdAt: Date }

export function redditConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.REDDIT_CLIENT_ID?.trim() && env.REDDIT_CLIENT_SECRET?.trim())
}

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
    if (!author || author === "[deleted]" || text === "[removed]" || text === "[deleted]") continue
    if (typeof d.id !== "string" || typeof d.title !== "string" || typeof d.permalink !== "string") continue
    posts.push({
      id: d.id,
      title: d.title,
      text: text.slice(0, 4_000),
      author,
      url: `https://www.reddit.com${d.permalink}`,
      createdAt: new Date((typeof d.created_utc === "number" ? d.created_utc : 0) * 1000),
    })
  }
  return posts
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

/** Recent posts (past week) for each query, de-duplicated by id. */
export async function searchReddit(queries: string[], { userAgent, env = process.env }: { userAgent: string; env?: Record<string, string | undefined> }): Promise<RedditPost[]> {
  const token = await appToken(userAgent, env)
  const seen = new Map<string, RedditPost>()
  for (const q of queries) {
    const url = `https://oauth.reddit.com/search?${new URLSearchParams({ q, sort: "new", t: "week", limit: "25", type: "link" })}`
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, "user-agent": userAgent }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`Reddit search failed (HTTP ${response.status})`)
    for (const post of parseListing(await response.json())) seen.set(post.id, post)
  }
  return [...seen.values()]
}
