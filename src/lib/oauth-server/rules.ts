/**
 * Salsox as an OAuth 2.0 authorization server, as pure rules: which clients
 * exist, what an authorize request must carry, PKCE, token shapes, client
 * authentication and scopes. The database side is store.ts; the endpoints
 * are /oauth/authorize (the consent page), /api/oauth/token and
 * /api/oauth/revoke. Tested in rules.test.ts.
 *
 * Why: the Salesforce package calls /api/v1 through a Named Credential,
 * which Salesforce's security review expects to be OAuth, not a pasted key
 * (marketing/marketplace-listings/salesforce-appexchange.md, direction 1).
 * Built in-house, narrowly, rather than with Better Auth's provider plugin,
 * which needs a newer Better Auth than this app runs.
 *
 * The profile, deliberately small:
 * - authorization code grant only, PKCE (S256) required, and refresh tokens;
 *   no implicit grant, no password grant, no client credentials;
 * - clients registered by the deployment (OAUTH_CLIENT_ID,
 *   OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URIS comma-separated, exact match;
 *   OAUTH_CLIENT_NAME for the consent page), confidential, authenticated
 *   with HTTP Basic or client_secret_post; none configured, none accepted;
 * - opaque tokens stored as SHA-256 hashes: codes ten minutes and one use,
 *   access tokens an hour, refresh tokens ninety days and rotated on use;
 * - scopes that map onto the API's routes (OAUTH_SCOPES).
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export const OAUTH_SCOPES = ["documents:send", "documents:read", "templates:read", "webhooks:manage"] as const
export type OAuthScope = (typeof OAUTH_SCOPES)[number]

export const CODE_TTL_MS = 10 * 60_000
export const ACCESS_TTL_MS = 60 * 60_000
export const REFRESH_TTL_MS = 90 * 24 * 60 * 60_000

export type OAuthClient = { id: string; secret: string; name: string; redirectUris: string[] }

/** The clients this deployment accepts: one, from the environment, or none. */
export function oauthClients(env: Record<string, string | undefined> = process.env): OAuthClient[] {
  const id = env.OAUTH_CLIENT_ID?.trim()
  const secret = env.OAUTH_CLIENT_SECRET?.trim()
  const redirectUris = (env.OAUTH_REDIRECT_URIS ?? "").split(",").map((u) => u.trim()).filter((u) => /^https:\/\/[^\s#]+$/.test(u))
  if (!id || !secret || secret.length < 32 || redirectUris.length === 0) return []
  return [{ id, secret, name: env.OAUTH_CLIENT_NAME?.trim() || "Salesforce", redirectUris }]
}

export function findClient(clients: OAuthClient[], id: unknown): OAuthClient | null {
  return typeof id === "string" ? clients.find((c) => c.id === id) ?? null : null
}

/** The scopes asked for, in canonical order; all of them when none are named; null when one is unknown. */
export function parseScopes(raw: unknown): OAuthScope[] | null {
  if (raw === undefined || raw === null || raw === "") return [...OAUTH_SCOPES]
  if (typeof raw !== "string") return null
  const asked = raw.split(/[\s+]+/).filter(Boolean)
  if (asked.some((s) => !(OAUTH_SCOPES as readonly string[]).includes(s))) return null
  return OAUTH_SCOPES.filter((s) => asked.includes(s))
}

export type AuthorizeRequest = { client: OAuthClient; redirectUri: string; scopes: OAuthScope[]; state: string | null; codeChallenge: string }

/**
 * An authorize request, checked. An unknown client or an unregistered
 * redirect address is shown on the page and never redirected to (RFC 6749
 * §4.1.2.1): that is how an open redirect is avoided. Anything else wrong is
 * sent back to the client's own address as an error.
 */
export function checkAuthorizeRequest(params: Record<string, string | undefined>, clients: OAuthClient[]):
  | { ok: true; request: AuthorizeRequest }
  | { ok: false; error: "unknown_client" | "bad_redirect" }
  | { ok: false; error: "invalid_request" | "unsupported_response_type" | "invalid_scope"; redirectUri: string; state: string | null } {
  const client = findClient(clients, params.client_id)
  if (!client) return { ok: false, error: "unknown_client" }
  const redirectUri = params.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined)
  if (!redirectUri || !client.redirectUris.includes(redirectUri)) return { ok: false, error: "bad_redirect" }
  const state = params.state && params.state.length <= 512 ? params.state : null
  const fail = (error: "invalid_request" | "unsupported_response_type" | "invalid_scope") => ({ ok: false as const, error, redirectUri, state })
  if (params.response_type !== "code") return fail("unsupported_response_type")
  if (params.code_challenge_method !== "S256" || !params.code_challenge || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge)) return fail("invalid_request")
  const scopes = parseScopes(params.scope)
  if (!scopes || scopes.length === 0) return fail("invalid_scope")
  return { ok: true, request: { client, redirectUri, scopes, state, codeChallenge: params.code_challenge } }
}

/** The client's redirect address with the outcome added: a code, or an error. */
export function authorizeRedirect(redirectUri: string, outcome: { code: string } | { error: string }, state: string | null): string {
  const url = new URL(redirectUri)
  if ("code" in outcome) url.searchParams.set("code", outcome.code)
  else url.searchParams.set("error", outcome.error)
  if (state) url.searchParams.set("state", state)
  return url.toString()
}

const PREFIX = { code: "sxo_c_", access: "sxo_at_", refresh: "sxo_rt_" } as const

export function generateToken(kind: keyof typeof PREFIX): string {
  return `${PREFIX[kind]}${randomBytes(30).toString("base64url")}`
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Whether a string has the shape of a token of this kind (40 URL-safe characters after the prefix). */
export function isToken(kind: keyof typeof PREFIX, value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX[kind]) && /^[A-Za-z0-9_-]{40}$/.test(value.slice(PREFIX[kind].length))
}

/** The access token a request carries as `Authorization: Bearer`, or null. */
export function bearerAccessToken(headers: { get(name: string): string | null }): string | null {
  const token = headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1]
  return isToken("access", token) ? token : null
}

/** PKCE S256: the verifier the token request carries matches the challenge the authorize request did. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false
  const computed = Buffer.from(createHash("sha256").update(verifier).digest("base64url"))
  const expected = Buffer.from(challenge)
  return computed.length === expected.length && timingSafeEqual(computed, expected)
}

/** The client a token or revoke request authenticates as: HTTP Basic, or client_id and client_secret in the body. */
export function authenticateClient(headers: { get(name: string): string | null }, body: URLSearchParams, clients: OAuthClient[]): OAuthClient | null {
  let id = body.get("client_id")
  let secret = body.get("client_secret")
  const basic = headers.get("authorization")?.match(/^Basic\s+(\S+)$/i)?.[1]
  if (basic) {
    const decoded = Buffer.from(basic, "base64").toString("utf8")
    const at = decoded.indexOf(":")
    if (at < 0) return null
    id = decodeURIComponent(decoded.slice(0, at))
    secret = decodeURIComponent(decoded.slice(at + 1))
  }
  const client = findClient(clients, id)
  if (!client || typeof secret !== "string") return null
  const a = Buffer.from(hashToken(secret))
  const b = Buffer.from(hashToken(client.secret))
  return timingSafeEqual(a, b) ? client : null
}

/** Whether a caller may use a route: API keys (no scopes) may use every route; tokens need the route's scope. */
export function scopeAllows(scopes: readonly string[] | null | undefined, required: OAuthScope | null): boolean {
  return !scopes || !required || scopes.includes(required)
}

/** Where a signed-out visitor to the consent page returns after signing in, if it is that page. */
export function resumablePath(raw: unknown): string | null {
  return typeof raw === "string" && raw.length <= 2048 && raw.startsWith("/oauth/authorize?") && !raw.includes("\\") && !/[\r\n]/.test(raw) ? raw : null
}
