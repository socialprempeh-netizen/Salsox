/**
 * X (Twitter), through its official API v2 recent search: posts and replies
 * from the last few days that name one of the tools alongside a pain word.
 * The X app's own keys (X_API_KEY, X_API_KEY_SECRET, the ones social.ts
 * posts with) are traded for an app-only bearer token, and an app-only token
 * can read but never post, like or reply, so this file is read-only by
 * construction, whatever access the app itself has.
 *
 * Every read is billed (X's pay-per-use plan charges per post and per user
 * returned), so this source is opt-in: it runs only when OUTREACH_X is "on",
 * each hunt asks for at most HITS_PER_TOOL posts per tool, and it only looks
 * back as far as the gap between two hunts. Every hit is still held to the
 * tool-mention and pain-topic rules (forum.ts) and its quote to the
 * word-for-word check (signals.ts); the tools' own accounts are left out in
 * the query itself. X profiles rarely show an address, so a lead from here
 * waits in the Needs contact queue like any other.
 *
 * The query builder and parsers are pure and tested (x.test.ts). No key or
 * token ever reaches an error message.
 */
import type { ForumItem } from "./forum"
import { FORUM_COMPETITORS, PAIN_TOPICS, type Competitor } from "./sources"

type Env = Record<string, string | undefined>

const TOKEN_URL = "https://api.x.com/oauth2/token"
const SEARCH_URL = "https://api.x.com/2/tweets/search/recent"

/** How far back a hunt looks: hunts run Mondays and Thursdays, so four days covers the longer gap. */
export const LOOKBACK_DAYS = 4
/** Posts asked for per tool per hunt (X's own range is 10 to 100). Each one returned is billed. */
export const HITS_PER_TOOL = 100
/** X's longest query on its self-serve plans. */
export const MAX_QUERY = 512
const MAX_TEXT = 4_000

/** The names and accounts each tool goes by on X. Dropbox Sign is still often called HelloSign. */
const X_NAMES: Record<string, { names: string[]; handles: string[] }> = {
  docusign: { names: ["DocuSign"], handles: ["DocuSign"] },
  pandadoc: { names: ["PandaDoc"], handles: ["PandaDoc"] },
  "dropbox-sign": { names: ["Dropbox Sign", "HelloSign"], handles: ["DropboxSign", "HelloSign"] },
}

/** X matches whole words only, with no plurals: the plural forms complaints use most, added to the pain words. */
const X_PLURALS = ["limits", "costs", "prices", "alternatives"]

const term = (word: string) => (word.includes(" ") ? `"${word}"` : word)

/**
 * One search per tool: its names or a mention of its account, with a pain
 * word, never a repost, never from the tool's own account, English only.
 */
export function xQueries(competitors: Competitor[] = FORUM_COMPETITORS): { competitor: Competitor; query: string }[] {
  const pain = [...Object.values(PAIN_TOPICS).flat(), ...X_PLURALS].map(term)
  return competitors.flatMap((competitor) => {
    const x = X_NAMES[competitor.id]
    if (!x) return []
    const tool = [...x.names.map(term), ...x.handles.map((h) => `@${h}`)].join(" OR ")
    const own = x.handles.map((h) => `-from:${h}`).join(" ")
    return [{ competitor, query: `(${tool}) (${pain.join(" OR ")}) -is:retweet ${own} lang:en` }]
  })
}

/** The app-only credentials, or null when the X keys are not both set. */
export function xSearchCredentials(env: Env = process.env): { key: string; secret: string } | null {
  const key = env.X_API_KEY?.trim() ?? ""
  const secret = env.X_API_KEY_SECRET?.trim() ?? ""
  return key && secret ? { key, secret } : null
}

/** Whether the hunt reads X: switched on, and the app's keys set. */
export function xConfigured(env: Env = process.env): boolean {
  return env.OUTREACH_X?.trim().toLowerCase() === "on" && xSearchCredentials(env) !== null
}

/** X escapes &, < and > in post text; the quote check needs the text as a reader sees it. */
export function xText(text: string): string {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").trim()
}

/**
 * The posts and replies in a search answer. A long post's full text is in
 * `note_tweet`; the author's handle comes from the `users` expansion, and a
 * post whose author is missing there is dropped (it has no link to show).
 */
export function parseSearch(json: unknown): ForumItem[] {
  const body = json as { data?: unknown; includes?: { users?: unknown } } | null
  if (!Array.isArray(body?.data)) return []
  const handles = new Map<string, string>()
  for (const u of Array.isArray(body.includes?.users) ? (body.includes.users as Record<string, unknown>[]) : []) {
    if (typeof u.id === "string" && typeof u.username === "string") handles.set(u.id, u.username)
  }
  const items: ForumItem[] = []
  for (const post of body.data as Record<string, unknown>[]) {
    const id = typeof post.id === "string" ? post.id : ""
    const author = handles.get(typeof post.author_id === "string" ? post.author_id : "") ?? ""
    const note = (post.note_tweet as { text?: unknown } | undefined)?.text
    const text = xText(typeof note === "string" ? note : typeof post.text === "string" ? post.text : "")
    if (!/^\d+$/.test(id) || !author || !text) continue
    items.push({ kind: "post", id, title: "", text: text.slice(0, MAX_TEXT), author, url: `https://x.com/${author}/status/${id}`, createdAt: new Date(typeof post.created_at === "string" ? post.created_at : 0) })
  }
  return items
}

/** X's reason for a refusal, as plain words, with every credential cut out. */
export function xError(status: number, body: string, secrets: string[]): string {
  let reason = ""
  try {
    const json = JSON.parse(body) as { detail?: unknown; title?: unknown }
    reason = String(json.detail ?? json.title ?? "")
  } catch {}
  for (const s of secrets) if (s) reason = reason.split(s).join("<setting>")
  const hint = status === 402 ? " (the X app has no API credits left)" : status === 429 ? " (rate limited)" : ""
  return `X search failed (HTTP ${status}${reason ? `: ${reason.slice(0, 120)}` : ""})${hint}`
}

/** Recent posts and replies for each tool, de-duplicated by id. Throws when X cannot be read. */
export async function searchX({ env = process.env, now = new Date(), days = LOOKBACK_DAYS }: { env?: Env; now?: Date; days?: number } = {}): Promise<ForumItem[]> {
  const creds = xSearchCredentials(env)
  if (!creds) throw new Error("X search is not configured")
  const secrets = [creds.key, creds.secret]
  const basic = Buffer.from(`${encodeURIComponent(creds.key)}:${encodeURIComponent(creds.secret)}`).toString("base64")
  const tokenResponse = await fetch(TOKEN_URL, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded;charset=UTF-8" }, body: "grant_type=client_credentials", signal: AbortSignal.timeout(20_000) })
  const tokenBody = await tokenResponse.text()
  const token = tokenResponse.ok ? ((JSON.parse(tokenBody) as { access_token?: string }).access_token ?? "") : ""
  if (!token) throw new Error(xError(tokenResponse.status, tokenBody, secrets).replace("X search", "X sign-in"))
  secrets.push(token)

  const startTime = new Date(now.getTime() - days * 86_400_000).toISOString()
  const seen = new Map<string, ForumItem>()
  for (const { query } of xQueries()) {
    const params = new URLSearchParams({ query, start_time: startTime, max_results: String(HITS_PER_TOOL), "tweet.fields": "created_at,author_id,note_tweet", expansions: "author_id", "user.fields": "username" })
    const response = await fetch(`${SEARCH_URL}?${params}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(xError(response.status, await response.text(), secrets))
    for (const item of parseSearch(await response.json())) seen.set(item.id, item)
  }
  return [...seen.values()]
}
