/**
 * Personal API keys, the database side (the rules are in api-keys.ts):
 * creating one (shown once), listing, revoking, and finding the account a
 * request's key belongs to. Used by the Developers page and by every
 * /api/v1 route through src/lib/api/v1.ts.
 */
import { prisma } from "@/lib/prisma"
import { apiKeyFromHeaders, generateApiKey, hashApiKey } from "@/lib/api-keys"

/** Live keys per account. */
export const MAX_API_KEYS = 10
/** lastUsedAt is written at most this often, not on every call. */
const TOUCH_MS = 5 * 60_000

export async function createApiKey(userId: string, name: string): Promise<{ ok: true; id: string; key: string; prefix: string } | { ok: false; error: "limit" | "name" }> {
  const clean = name.trim().slice(0, 60)
  if (!clean) return { ok: false, error: "name" }
  if ((await prisma.apiKey.count({ where: { userId, revokedAt: null } })) >= MAX_API_KEYS) return { ok: false, error: "limit" }
  const { key, prefix, hash } = generateApiKey()
  const row = await prisma.apiKey.create({ data: { userId, name: clean, prefix, hash }, select: { id: true } })
  return { ok: true, id: row.id, key, prefix }
}

export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
  })
}

export async function revokeApiKey(userId: string, id: string): Promise<boolean> {
  return (await prisma.apiKey.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } })).count > 0
}

export type ApiCaller = { keyId: string; userId: string; email: string; name: string | null }

/** The account behind a request's key, or null for a missing, wrong or revoked one. */
export async function authenticateApiRequest(headers: { get(name: string): string | null }, now = new Date()): Promise<ApiCaller | null> {
  const key = apiKeyFromHeaders(headers)
  if (!key) return null
  const row = await prisma.apiKey.findUnique({
    where: { hash: hashApiKey(key) },
    select: { id: true, revokedAt: true, lastUsedAt: true, user: { select: { id: true, email: true, name: true } } },
  })
  if (!row || row.revokedAt) return null
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOUCH_MS) {
    await prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: now } }).catch(() => {})
  }
  return { keyId: row.id, userId: row.user.id, email: row.user.email, name: row.user.name }
}
