/**
 * HubSpot connections, the side that calls HubSpot and the database (the
 * rules are in hubspot.ts):
 *
 * - completeHubSpotConnection: the callback's step, exchanging the code,
 *   asking HubSpot which account it is for, and keeping the tokens sealed.
 * - hubSpotAccessToken: a live access token for an account, refreshed and
 *   saved when the stored one has lapsed. Every HubSpot call goes through it.
 * - disconnectHubSpot: the refresh token revoked at HubSpot, then forgotten.
 *
 * Tokens never reach a log or an error message: failures are reported by
 * HTTP status only.
 */
import { prisma } from "@/lib/prisma"
import { openSecret, sealSecret } from "@/lib/webhooks/secret-box"
import { siteConfig } from "@/config/site"
import { HUBSPOT_TOKEN_URL, hubspotConfig, integrationCallbackUrl, hubspotRevokeUrl, hubspotTokenBody, hubspotTokenInfoUrl, needsRefresh, readHubSpotTokenInfo, readHubSpotTokens } from "./hubspot"

const TIMEOUT_MS = 15_000

async function tokenRequest(body: URLSearchParams): Promise<unknown> {
  const res = await fetch(HUBSPOT_TOKEN_URL, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`HubSpot token request answered ${res.status}`)
  return res.json()
}

/** Exchanges the callback's code and stores the connection for `userId`, replacing any earlier one. */
export async function completeHubSpotConnection(input: { userId: string; code: string; redirectUri: string; now?: Date }): Promise<{ hubId: string; hubDomain: string | null }> {
  const config = hubspotConfig()
  if (!config) throw new Error("HubSpot is not configured")
  const now = input.now ?? new Date()
  const tokens = readHubSpotTokens(await tokenRequest(hubspotTokenBody({ config, redirectUri: input.redirectUri, code: input.code })), now)
  if (!tokens) throw new Error("HubSpot answered without tokens")
  const infoRes = await fetch(hubspotTokenInfoUrl(tokens.accessToken), { signal: AbortSignal.timeout(TIMEOUT_MS) })
  const info = infoRes.ok ? readHubSpotTokenInfo(await infoRes.json()) : null
  if (!info) throw new Error(`HubSpot token metadata answered ${infoRes.status}`)
  const sealed = { accessToken: sealSecret(tokens.accessToken), refreshToken: sealSecret(tokens.refreshToken), expiresAt: tokens.expiresAt, hubId: info.hubId, hubDomain: info.hubDomain, scopes: info.scopes }
  await prisma.hubSpotConnection.upsert({ where: { userId: input.userId }, create: { userId: input.userId, ...sealed }, update: sealed })
  return { hubId: info.hubId, hubDomain: info.hubDomain }
}

/** A usable access token for the account's HubSpot connection, or null when there is none. */
export async function hubSpotAccessToken(userId: string, now = new Date()): Promise<string | null> {
  const row = await prisma.hubSpotConnection.findUnique({ where: { userId } })
  if (!row) return null
  if (!needsRefresh(row.expiresAt, now)) return openSecret(row.accessToken)
  const config = hubspotConfig()
  if (!config) return null
  const tokens = readHubSpotTokens(await tokenRequest(hubspotTokenBody({ config, redirectUri: integrationCallbackUrl(siteConfig.url, "hubspot"), refreshToken: openSecret(row.refreshToken) })), now)
  if (!tokens) throw new Error("HubSpot refresh answered without tokens")
  await prisma.hubSpotConnection.update({ where: { userId }, data: { accessToken: sealSecret(tokens.accessToken), refreshToken: sealSecret(tokens.refreshToken), expiresAt: tokens.expiresAt } })
  return tokens.accessToken
}

/** Revokes the refresh token at HubSpot (best effort) and forgets the connection. */
export async function disconnectHubSpot(userId: string): Promise<boolean> {
  const row = await prisma.hubSpotConnection.findUnique({ where: { userId }, select: { refreshToken: true } })
  if (!row) return false
  try {
    await fetch(hubspotRevokeUrl(openSecret(row.refreshToken)), { method: "DELETE", signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch {
    // Forgotten here either way: an unreachable HubSpot must not keep the connection alive.
  }
  await prisma.hubSpotConnection.deleteMany({ where: { userId } })
  return true
}

export async function hubSpotStatus(userId: string): Promise<{ hubId: string; hubDomain: string | null; connectedAt: Date } | null> {
  const row = await prisma.hubSpotConnection.findUnique({ where: { userId }, select: { hubId: true, hubDomain: true, createdAt: true } })
  return row ? { hubId: row.hubId, hubDomain: row.hubDomain, connectedAt: row.createdAt } : null
}
