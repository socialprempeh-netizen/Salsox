/**
 * Posting to the product's own social accounts through each platform's
 * official API, and nothing else: no logging in as a person, no browser
 * automation. A platform without its credentials is simply not offered.
 *
 *  - Facebook Page: Meta Graph API, POST /{page-id}/feed with a Page access
 *    token (META_PAGE_ID, META_PAGE_ACCESS_TOKEN; META_GRAPH_VERSION, default
 *    v23.0). Instagram needs an image per post, so it is not offered for text.
 *  - LinkedIn company page: Posts API, POST /rest/posts as the organization
 *    (LINKEDIN_ORGANIZATION_ID, LINKEDIN_ACCESS_TOKEN with w_organization_social;
 *    LINKEDIN_API_VERSION, default 202510).
 *  - X: API v2, POST /2/tweets with an OAuth 2.0 user-context token
 *    (X_ACCESS_TOKEN, tweet.write scope).
 *
 * Request building and length rules are pure and tested; `publish` only
 * sends what they build. Tokens go in headers or the request body to the
 * platform, never into a log or an error message.
 */
import type { SocialPlatform } from "@prisma/client"

export const PLATFORMS: SocialPlatform[] = ["LINKEDIN", "X", "FACEBOOK"]

/** Longest post each platform accepts. */
export const LIMITS: Record<SocialPlatform, number> = { X: 280, LINKEDIN: 3000, FACEBOOK: 5000 }

type Env = Record<string, string | undefined>

export function platformConfigured(platform: SocialPlatform, env: Env = process.env): boolean {
  if (platform === "FACEBOOK") return Boolean(env.META_PAGE_ID?.trim() && env.META_PAGE_ACCESS_TOKEN?.trim())
  if (platform === "LINKEDIN") return Boolean(env.LINKEDIN_ORGANIZATION_ID?.trim() && env.LINKEDIN_ACCESS_TOKEN?.trim())
  return Boolean(env.X_ACCESS_TOKEN?.trim())
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
    const version = env.META_GRAPH_VERSION?.trim() || "v23.0"
    return {
      url: `https://graph.facebook.com/${version}/${encodeURIComponent(env.META_PAGE_ID!.trim())}/feed`,
      init: { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ message: text, access_token: env.META_PAGE_ACCESS_TOKEN!.trim() }).toString() },
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
          "linkedin-version": env.LINKEDIN_API_VERSION?.trim() || "202510",
          "x-restli-protocol-version": "2.0.0",
        },
        body: JSON.stringify({
          author: `urn:li:organization:${env.LINKEDIN_ORGANIZATION_ID!.trim()}`,
          commentary: text,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
      },
    }
  }
  return {
    url: "https://api.x.com/2/tweets",
    init: { method: "POST", headers: { authorization: `Bearer ${env.X_ACCESS_TOKEN!.trim()}`, "content-type": "application/json" }, body: JSON.stringify({ text }) },
  }
}

/** The platform's id for the new post, from its answer. */
export async function readPostId(platform: SocialPlatform, response: Response): Promise<string | null> {
  if (platform === "LINKEDIN") return response.headers.get("x-restli-id") ?? response.headers.get("x-linkedin-id")
  const json = (await response.json().catch(() => null)) as { id?: string; data?: { id?: string } } | null
  return (platform === "X" ? json?.data?.id : json?.id) ?? null
}

/** Publishes one post. Throws with the platform's status, never with a token. */
export async function publish(platform: SocialPlatform, body: string, env: Env = process.env): Promise<{ externalId: string | null }> {
  if (!platformConfigured(platform, env)) throw new Error(`${platform} is not connected`)
  const problem = postProblem(platform, body)
  if (problem) throw new Error(problem === "empty" ? "the post is empty" : `the post is longer than ${LIMITS[platform]} characters`)
  const { url, init } = buildRequest(platform, body, env)
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${platform} refused the post (HTTP ${response.status})`)
  return { externalId: await readPostId(platform, response) }
}
