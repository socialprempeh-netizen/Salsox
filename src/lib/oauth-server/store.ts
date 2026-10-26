/**
 * The OAuth server's database side (the rules are in rules.ts):
 *
 * - issueCode: after consent, a one-time code bound to the user, client,
 *   redirect address, scopes and PKCE challenge.
 * - exchangeCode: the token endpoint's authorization_code grant. A code used
 *   twice revokes the grant it produced: a second use means it leaked.
 * - refreshGrant: the refresh_token grant, rotating the refresh token. One
 *   used after its rotation revokes the whole grant, for the same reason.
 * - revokeToken: the revocation endpoint; ends the token's grant.
 * - authenticateOAuthRequest: the account and scopes behind an access token,
 *   for /api/v1 (src/lib/api/v1.ts).
 * - listGrants / revokeGrant: "Connected apps" on the Developers page.
 *
 * Only hashes are stored. Every check that decides something (one use,
 * one rotation) is a conditional write, so two concurrent requests cannot
 * both win.
 */
import { prisma } from "@/lib/prisma"
import { ACCESS_TTL_MS, CODE_TTL_MS, generateToken, hashToken, pkceMatches, REFRESH_TTL_MS, type AuthorizeRequest, type OAuthClient, type OAuthScope } from "./rules"

/** lastUsedAt is written at most this often. */
const TOUCH_MS = 5 * 60_000

export type TokenSet = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string }
export type GrantError = { error: "invalid_grant" | "invalid_request"; description: string }

export async function issueCode(userId: string, request: AuthorizeRequest, now = new Date()): Promise<string> {
  const code = generateToken("code")
  await prisma.oAuthCode.create({
    data: { hash: hashToken(code), userId, clientId: request.client.id, redirectUri: request.redirectUri, scopes: request.scopes, codeChallenge: request.codeChallenge, expiresAt: new Date(now.getTime() + CODE_TTL_MS) },
  })
  return code
}

async function issueTokens(grantId: string, scopes: string[], now: Date): Promise<TokenSet> {
  const access = generateToken("access")
  const refresh = generateToken("refresh")
  await prisma.oAuthToken.createMany({
    data: [
      { grantId, kind: "ACCESS", hash: hashToken(access), expiresAt: new Date(now.getTime() + ACCESS_TTL_MS) },
      { grantId, kind: "REFRESH", hash: hashToken(refresh), expiresAt: new Date(now.getTime() + REFRESH_TTL_MS) },
    ],
  })
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: scopes.join(" ") }
}

async function revokeGrantById(grantId: string, now: Date): Promise<void> {
  await prisma.$transaction([
    prisma.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: now } }),
    prisma.oAuthToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: now } }),
  ])
}

export async function exchangeCode(input: { code: unknown; client: OAuthClient; redirectUri: unknown; verifier: unknown; now?: Date }): Promise<TokenSet | GrantError> {
  const now = input.now ?? new Date()
  const invalid: GrantError = { error: "invalid_grant", description: "The code is not valid." }
  if (typeof input.code !== "string") return { error: "invalid_request", description: "`code` is required." }
  const row = await prisma.oAuthCode.findUnique({ where: { hash: hashToken(input.code) } })
  if (!row || row.clientId !== input.client.id) return invalid
  if (row.usedAt) {
    // Replayed: whatever the first use produced is revoked too.
    if (row.grantId) await revokeGrantById(row.grantId, now)
    return invalid
  }
  if (row.expiresAt <= now || row.redirectUri !== input.redirectUri || !pkceMatches(input.verifier, row.codeChallenge)) return invalid
  const claimed = await prisma.oAuthCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } })
  if (claimed.count === 0) return invalid

  // One grant per person and client: connecting again updates it.
  const existing = await prisma.oAuthGrant.findFirst({ where: { userId: row.userId, clientId: row.clientId, revokedAt: null }, select: { id: true } })
  const grant = existing
    ? await prisma.oAuthGrant.update({ where: { id: existing.id }, data: { scopes: row.scopes }, select: { id: true } })
    : await prisma.oAuthGrant.create({ data: { userId: row.userId, clientId: row.clientId, scopes: row.scopes }, select: { id: true } })
  await prisma.oAuthCode.update({ where: { id: row.id }, data: { grantId: grant.id } })
  return issueTokens(grant.id, row.scopes, now)
}

export async function refreshGrant(input: { refreshToken: unknown; client: OAuthClient; now?: Date }): Promise<TokenSet | GrantError> {
  const now = input.now ?? new Date()
  const invalid: GrantError = { error: "invalid_grant", description: "The refresh token is not valid." }
  if (typeof input.refreshToken !== "string") return { error: "invalid_request", description: "`refresh_token` is required." }
  const row = await prisma.oAuthToken.findUnique({ where: { hash: hashToken(input.refreshToken) }, include: { grant: true } })
  if (!row || row.kind !== "REFRESH" || row.grant.clientId !== input.client.id) return invalid
  if (row.rotatedAt) {
    // Used again after it was exchanged: a copy exists somewhere. End the grant.
    await revokeGrantById(row.grantId, now)
    return invalid
  }
  if (row.revokedAt || row.grant.revokedAt || row.expiresAt <= now) return invalid
  const claimed = await prisma.oAuthToken.updateMany({ where: { id: row.id, rotatedAt: null, revokedAt: null }, data: { rotatedAt: now } })
  if (claimed.count === 0) return invalid
  // The old access tokens end with the rotation.
  await prisma.oAuthToken.updateMany({ where: { grantId: row.grantId, kind: "ACCESS", revokedAt: null }, data: { revokedAt: now } })
  return issueTokens(row.grantId, row.grant.scopes, now)
}

/** RFC 7009: ends the grant a token of this client belongs to. Unknown tokens are not an error. */
export async function revokeToken(token: unknown, client: OAuthClient, now = new Date()): Promise<void> {
  if (typeof token !== "string") return
  const row = await prisma.oAuthToken.findUnique({ where: { hash: hashToken(token) }, select: { grantId: true, grant: { select: { clientId: true } } } })
  if (row && row.grant.clientId === client.id) await revokeGrantById(row.grantId, now)
}

export type OAuthCaller = { keyId: string; grantId: string; userId: string; email: string; name: string | null; scopes: OAuthScope[] }

/** The account and scopes behind an access token, or null for a missing, expired or revoked one. */
export async function authenticateOAuthToken(token: string, now = new Date()): Promise<OAuthCaller | null> {
  const row = await prisma.oAuthToken.findUnique({
    where: { hash: hashToken(token) },
    select: { kind: true, expiresAt: true, revokedAt: true, grant: { select: { id: true, scopes: true, revokedAt: true, lastUsedAt: true, user: { select: { id: true, email: true, name: true } } } } },
  })
  if (!row || row.kind !== "ACCESS" || row.revokedAt || row.grant.revokedAt || row.expiresAt <= now) return null
  if (!row.grant.lastUsedAt || now.getTime() - row.grant.lastUsedAt.getTime() > TOUCH_MS) {
    await prisma.oAuthGrant.update({ where: { id: row.grant.id }, data: { lastUsedAt: now } }).catch(() => {})
  }
  // `keyId` is the grant, so the per-key rate limit applies per connection.
  return { keyId: `oauth:${row.grant.id}`, grantId: row.grant.id, userId: row.grant.user.id, email: row.grant.user.email, name: row.grant.user.name, scopes: row.grant.scopes as OAuthScope[] }
}

export async function listGrants(userId: string) {
  return prisma.oAuthGrant.findMany({ where: { userId, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, clientId: true, scopes: true, createdAt: true, lastUsedAt: true } })
}

export async function revokeGrant(userId: string, grantId: string, now = new Date()): Promise<boolean> {
  const grant = await prisma.oAuthGrant.findFirst({ where: { id: grantId, userId, revokedAt: null }, select: { id: true } })
  if (!grant) return false
  await revokeGrantById(grant.id, now)
  return true
}
