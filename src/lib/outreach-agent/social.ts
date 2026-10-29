/**
 * Posting to the product's own social accounts through each platform's
 * official API, and nothing else: no logging in as a person, no browser
 * automation. A platform without its credentials is simply not offered.
 *
 *  - Facebook Page: Meta Graph API, POST /{page-id}/feed with a Page access
 *    token (FACEBOOK_PAGE_ID, the numeric id; FACEBOOK_PAGE_ACCESS_TOKEN;
 *    FACEBOOK_GRAPH_VERSION, default v23.0). The META_* names these had first
 *    (META_PAGE_ID, META_PAGE_ACCESS_TOKEN, META_GRAPH_VERSION) still work.
 *    Instagram needs an image per post, so it is not offered for text.
 *  - LinkedIn company page: Posts API, POST /rest/posts as the organization
 *    (LINKEDIN_ORGANIZATION_ID, LINKEDIN_ACCESS_TOKEN with w_organization_social;
 *    LINKEDIN_API_VERSION, default 202610; 202510 was retired a year on).
 *    w_organization_social comes only with LinkedIn's Community Management
 *    API product, which LinkedIn must approve. Until then LINKEDIN_AUTHOR=person
 *    posts from the token holder's own profile instead (w_member_social, from
 *    the self-serve Share on LinkedIn product), as urn:li:person:<id> from
 *    LINKEDIN_PERSON_ID, or looked up from /v2/userinfo when the token also
 *    has openid and profile.
 *  - X: API v2, POST /2/tweets, signed with OAuth 1.0a when the app's own
 *    keys are set (X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN,
 *    X_ACCESS_TOKEN_SECRET; see oauth1.ts), or else with an OAuth 2.0
 *    user-context token alone in X_ACCESS_TOKEN (tweet.write scope).
 *
 * Request building and length rules are pure and tested; `publish` only
 * sends what they build. Tokens go in headers or the request body to the
 * platform, never into a log or an error message.
 *
 * Reddit, TikTok and YouTube are drafted but never published from here:
 * Reddit posts are submitted by hand on reddit.com's own submit page, opened
 * pre-filled (redditSubmitUrl), and TikTok and YouTube need a video, so their
 * caption, title and description are copied in by hand. `publish` refuses
 * them, and they can never be scheduled.
 */
import type { SocialPlatform } from "@prisma/client"
import { oauth1Header, type OAuth1Credentials } from "./oauth1"

/** The platforms the agent publishes to through their APIs. */
export const PLATFORMS: SocialPlatform[] = ["LINKEDIN", "X", "FACEBOOK"]

/** Drafted only; a person posts them (Reddit from its submit page, TikTok and YouTube with a video). */
export const MANUAL_PLATFORMS: SocialPlatform[] = ["REDDIT", "TIKTOK", "YOUTUBE"]

/** Every platform, in the order the studio shows them. */
export const ALL_PLATFORMS: SocialPlatform[] = ["X", "LINKEDIN", "FACEBOOK", "REDDIT", "TIKTOK", "YOUTUBE"]

export const isAutoPlatform = (platform: SocialPlatform) => PLATFORMS.includes(platform)

/** Each platform's own name, as the brand writes it. */
export const PLATFORM_LABEL: Record<SocialPlatform, string> = { X: "X", LINKEDIN: "LinkedIn", FACEBOOK: "Facebook", REDDIT: "Reddit", TIKTOK: "TikTok", YOUTUBE: "YouTube" }

/**
 * Longest text each platform accepts in the post body: the post itself; a
 * Reddit post's body; a TikTok or YouTube caption. Was X, LinkedIn and
 * Facebook only: { X: 280, LINKEDIN: 3000, FACEBOOK: 5000 }.
 */
export const LIMITS: Record<SocialPlatform, number> = { X: 280, LINKEDIN: 3000, FACEBOOK: 5000, REDDIT: 40000, TIKTOK: 2200, YOUTUBE: 500 }

/** The title each manual platform needs, and its longest length. */
export const TITLE_LIMITS: Partial<Record<SocialPlatform, number>> = { REDDIT: 300, TIKTOK: 90, YOUTUBE: 100 }

/** The video description TikTok and YouTube take, and its longest length. */
export const DESCRIPTION_LIMITS: Partial<Record<SocialPlatform, number>> = { TIKTOK: 4000, YOUTUBE: 5000 }

export type DraftFields = { body: string; title?: string | null; description?: string | null }
export type FieldProblem = { field: "body" | "title" | "description"; problem: "empty" | "tooLong" }

const chars = (text: string) => [...text.trim()].length

/** Every field of a draft that is missing or too long for its platform; empty when it is complete. */
export function draftProblems(platform: SocialPlatform, fields: DraftFields): FieldProblem[] {
  const problems: FieldProblem[] = []
  const check = (field: FieldProblem["field"], value: string | null | undefined, limit: number) => {
    if (!value?.trim()) problems.push({ field, problem: "empty" })
    else if (chars(value) > limit) problems.push({ field, problem: "tooLong" })
  }
  check("body", fields.body, LIMITS[platform])
  const title = TITLE_LIMITS[platform]
  if (title) check("title", fields.title, title)
  const description = DESCRIPTION_LIMITS[platform]
  if (description) check("description", fields.description, description)
  return problems
}

/**
 * reddit.com's own "create post" page, pre-filled with a text post's title
 * and body, for a person to choose the community, review and submit. Nothing
 * is posted by this app. A very long body is cut to keep the address within
 * what browsers and Reddit accept; the studio offers the full text to copy.
 */
export const REDDIT_URL_BODY_MAX = 6000

export function redditSubmitUrl({ title, body }: { title: string; body: string }): string {
  const text = body.trim()
  // `type=TEXT` asks the current submit page for a text post; `selftext=true`
  // does the same on old.reddit.com, which ignores `type`.
  const params = new URLSearchParams({ type: "TEXT", selftext: "true", title: title.trim().slice(0, TITLE_LIMITS.REDDIT!), text: text.length > REDDIT_URL_BODY_MAX ? text.slice(0, REDDIT_URL_BODY_MAX) : text })
  return `https://www.reddit.com/submit?${params.toString()}`
}

type Env = Record<string, string | undefined>

const read = (env: Env, ...names: string[]) => names.map((n) => env[n]?.trim()).find(Boolean) ?? ""

/** The Facebook Page settings, under their FACEBOOK_* names or the earlier META_* ones. */
export function facebookSettings(env: Env = process.env) {
  return {
    pageId: read(env, "FACEBOOK_PAGE_ID", "META_PAGE_ID"),
    token: read(env, "FACEBOOK_PAGE_ACCESS_TOKEN", "META_PAGE_ACCESS_TOKEN"),
    version: read(env, "FACEBOOK_GRAPH_VERSION", "META_GRAPH_VERSION") || "v23.0",
  }
}

/** Who LinkedIn posts are from: the company page (the default) or, with LINKEDIN_AUTHOR=person, the token holder's own profile. */
export function linkedinAuthorMode(env: Env = process.env): "organization" | "person" {
  return read(env, "LINKEDIN_AUTHOR").toLowerCase() === "person" ? "person" : "organization"
}

/** The author URN a LinkedIn post carries, or null when the id it needs is not known yet. */
export function linkedinAuthorUrn(env: Env = process.env): string | null {
  if (linkedinAuthorMode(env) === "person") {
    const id = read(env, "LINKEDIN_PERSON_ID")
    return id ? `urn:li:person:${id}` : null
  }
  const org = read(env, "LINKEDIN_ORGANIZATION_ID")
  return org ? `urn:li:organization:${org}` : null
}

/** How X requests are authorised: OAuth 1.0a with the app's four keys, an OAuth 2.0 token alone, or not at all. */
export function xAuth(env: Env = process.env): { kind: "oauth1"; credentials: OAuth1Credentials } | { kind: "bearer"; token: string } | null {
  const consumerKey = read(env, "X_API_KEY")
  const consumerSecret = read(env, "X_API_KEY_SECRET")
  const token = read(env, "X_ACCESS_TOKEN")
  const tokenSecret = read(env, "X_ACCESS_TOKEN_SECRET")
  if (consumerKey && consumerSecret && token && tokenSecret) return { kind: "oauth1", credentials: { consumerKey, consumerSecret, token, tokenSecret } }
  if (token && !tokenSecret) return { kind: "bearer", token }
  return null
}

export function platformConfigured(platform: SocialPlatform, env: Env = process.env): boolean {
  // Manual platforms have no API connection to configure.
  if (!isAutoPlatform(platform)) return false
  // Was META_PAGE_ID and META_PAGE_ACCESS_TOKEN only, and X_ACCESS_TOKEN alone for X.
  if (platform === "FACEBOOK") {
    const fb = facebookSettings(env)
    return Boolean(fb.pageId && fb.token)
  }
  // Was LINKEDIN_ORGANIZATION_ID and LINKEDIN_ACCESS_TOKEN only. Posting as a
  // person needs only the token: the person's id can be looked up with it.
  // if (platform === "LINKEDIN") return Boolean(env.LINKEDIN_ORGANIZATION_ID?.trim() && env.LINKEDIN_ACCESS_TOKEN?.trim())
  if (platform === "LINKEDIN") return Boolean(read(env, "LINKEDIN_ACCESS_TOKEN") && (linkedinAuthorMode(env) === "person" || read(env, "LINKEDIN_ORGANIZATION_ID")))
  return xAuth(env) !== null
}

/** Why a post cannot go out as written, or null when it can. */
export function postProblem(platform: SocialPlatform, body: string): "empty" | "tooLong" | null {
  const text = body.trim()
  if (!text) return "empty"
  // X counts characters, not UTF-16 units; close enough for the plain text written here.
  if ([...text].length > LIMITS[platform]) return "tooLong"
  return null
}

export type PlatformRequest = { url: string; init: RequestInit }

export function buildRequest(platform: SocialPlatform, body: string, env: Env = process.env): PlatformRequest {
  const text = body.trim()
  if (platform === "FACEBOOK") {
    const fb = facebookSettings(env)
    return {
      url: `https://graph.facebook.com/${fb.version}/${encodeURIComponent(fb.pageId)}/feed`,
      init: { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ message: text, access_token: fb.token }).toString() },
    }
  }
  if (platform === "LINKEDIN") {
    return {
      url: "https://api.linkedin.com/rest/posts",
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.LINKEDIN_ACCESS_TOKEN!.trim()}`,
          "content-type": "application/json",
          // Was "202510": LinkedIn retires each version after about a year.
          "linkedin-version": env.LINKEDIN_API_VERSION?.trim() || "202610",
          "x-restli-protocol-version": "2.0.0",
        },
        body: JSON.stringify({
          // Was always the organization: `urn:li:organization:${env.LINKEDIN_ORGANIZATION_ID!.trim()}`
          author: linkedinAuthorUrn(env),
          commentary: text,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      },
    }
  }
  // With OAuth 1.0a the Authorization header is signed per request in
  // `publish` (signing is asynchronous); with an OAuth 2.0 token it is set here.
  const auth = xAuth(env)
  return {
    url: "https://api.x.com/2/tweets",
    init: { method: "POST", headers: { ...(auth?.kind === "bearer" ? { authorization: `Bearer ${auth.token}` } : {}), "content-type": "application/json" }, body: JSON.stringify({ text }) },
  }
}

/** The platform's id for the new post, from its answer. */
export async function readPostId(platform: SocialPlatform, response: Response): Promise<string | null> {
  if (platform === "LINKEDIN") return response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id")
  const json = (await response.json().catch(() => null)) as { id?: string; data?: { id?: string } } | null
  return (platform === "X" ? json?.data?.id : json?.id) ?? null
}

/** Every credential a platform's request carries, so none can reach an error message. */
function secretsOf(platform: SocialPlatform, env: Env): string[] {
  if (platform === "FACEBOOK") return [facebookSettings(env).token]
  if (platform === "LINKEDIN") return [read(env, "LINKEDIN_ACCESS_TOKEN")]
  return ["X_API_KEY", "X_API_KEY_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"].map((n) => read(env, n))
}

/**
 * The platform's own explanation of a refusal, from its error body (Meta's
 * `error.message`, X's `detail` or `title`, LinkedIn's `message`), as
 * ": reason", or nothing. Any credential is cut out, and it is kept short.
 */
export async function refusalReason(response: Response, secrets: string[]): Promise<string> {
  const json = (await response.json().catch(() => null)) as { error?: { message?: string; code?: number; type?: string }; detail?: string; title?: string; message?: string } | null
  const raw = json?.error?.message ? `${json.error.message}${json.error.code ? ` (code ${json.error.code})` : ""}` : json?.detail || json?.title || json?.message || ""
  const clean = secrets.filter((x) => x.length > 3).reduce((text, secret) => text.split(secret).join("[redacted]"), String(raw)).trim().slice(0, 300)
  return clean ? `: ${clean}` : ""
}

/**
 * Refusals that are about the account, not the post: the same post will be
 * refused again until a person fixes something in the platform's own
 * dashboard. Each is said in plain words with what to do, and a post refused
 * this way goes back to waiting (it is not failed), while the platform is
 * skipped by "Publish all" and the scheduler until a post gets through.
 */
export const ACCOUNT_PROBLEMS = {
  xCredits: "X API credit is empty, add credit in the X Developer Console.",
  linkedinOrganization:
    "LinkedIn will not let this app post as the company page: its token lacks the w_organization_social permission, which comes with LinkedIn's Community Management API product. Request that product for the app, or set LINKEDIN_AUTHOR=person to post from your own profile until it is approved.",
  linkedinPersonId:
    "LinkedIn needs your member id to post from your profile: set LINKEDIN_PERSON_ID, or re-authorise the token with the openid and profile scopes so it can be looked up.",
  linkedinToken: "The LinkedIn access token has expired or was revoked. Generate a new one and update LINKEDIN_ACCESS_TOKEN.",
} as const

export class PlatformAccountError extends Error {}

/** The account problem behind a refusal, in plain words, or null when the refusal is about the post itself. Pure. */
export function accountProblem(platform: SocialPlatform, status: number, reason: string): string | null {
  if (platform === "X" && /credits?\s+depleted/i.test(reason)) return ACCOUNT_PROBLEMS.xCredits
  if (platform === "LINKEDIN") {
    if (/organization id|organization as author|w_organization_social/i.test(reason)) return ACCOUNT_PROBLEMS.linkedinOrganization
    if (status === 401) return ACCOUNT_PROBLEMS.linkedinToken
  }
  return null
}

const ACCOUNT_MESSAGES: string[] = Object.values(ACCOUNT_PROBLEMS)

/** Whether a stored error is one of the account problems above. */
export function isAccountProblem(error: string | null | undefined): boolean {
  return Boolean(error) && ACCOUNT_MESSAGES.some((m) => error!.includes(m))
}

/**
 * The API platforms that are known to be failing: those whose most recent
 * publishing attempt was refused for an account problem. A LinkedIn
 * company-page refusal stops counting once LINKEDIN_AUTHOR=person, since
 * posts no longer go out as the company. A platform comes back as soon as a
 * post gets through (one published by hand with Publish now or Retry).
 */
export function failingPlatforms(lastAttempts: { platform: SocialPlatform; error: string | null; published: boolean }[], env: Env = process.env): Map<SocialPlatform, string> {
  const failing = new Map<SocialPlatform, string>()
  for (const a of lastAttempts) {
    if (a.published || !isAccountProblem(a.error)) continue
    if (a.platform === "LINKEDIN" && a.error!.includes(ACCOUNT_PROBLEMS.linkedinOrganization) && linkedinAuthorMode(env) === "person") continue
    failing.set(a.platform, a.error!)
  }
  return failing
}

/** The token holder's member id, from /v2/userinfo; null when the token cannot read it (it needs openid and profile). */
async function linkedinPersonId(env: Env): Promise<string | null> {
  const response = await fetch("https://api.linkedin.com/v2/userinfo", { headers: { authorization: `Bearer ${read(env, "LINKEDIN_ACCESS_TOKEN")}` }, signal: AbortSignal.timeout(15_000) }).catch(() => null)
  if (!response?.ok) return null
  const json = (await response.json().catch(() => null)) as { sub?: unknown } | null
  return typeof json?.sub === "string" && json.sub ? json.sub : null
}

/** Publishes one post. Throws with the platform's status and reason, never with a token; an account problem throws PlatformAccountError. */
export async function publish(platform: SocialPlatform, body: string, env: Env = process.env): Promise<{ externalId: string | null }> {
  if (!isAutoPlatform(platform)) throw new Error(`${platform} is posted by hand, never by the agent`)
  if (!platformConfigured(platform, env)) throw new Error(`${platform} is not connected`)
  const problem = postProblem(platform, body)
  if (problem) throw new Error(problem === "empty" ? "the post is empty" : `the post is longer than ${LIMITS[platform]} characters`)
  // Posting as a person with no id set: look it up with the token, once per post.
  if (platform === "LINKEDIN" && !linkedinAuthorUrn(env)) {
    const personId = await linkedinPersonId(env)
    if (!personId) throw new PlatformAccountError(ACCOUNT_PROBLEMS.linkedinPersonId)
    env = { ...env, LINKEDIN_PERSON_ID: personId }
  }
  const { url, init } = buildRequest(platform, body, env)
  const auth = platform === "X" ? xAuth(env) : null
  if (auth?.kind === "oauth1") init.headers = { ...(init.headers as Record<string, string>), authorization: await oauth1Header({ method: "POST", url }, auth.credentials) }
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  // Was the status alone: the platform's own reason is what tells a person what to fix.
  if (!response.ok) {
    const reason = await refusalReason(response, secretsOf(platform, env))
    const account = accountProblem(platform, response.status, reason)
    if (account) throw new PlatformAccountError(account)
    throw new Error(`${platform} refused the post (HTTP ${response.status})${reason}`)
  }
  return { externalId: await readPostId(platform, response) }
}
