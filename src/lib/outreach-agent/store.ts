/**
 * The outreach agent's memory: every read and write of its seven tables
 * (prisma/schema.prisma, "Outreach agent"), and nothing else. Decisions are
 * made in the pure files beside this one; this only moves rows. Nothing here
 * touches the app's own tables: the Outreach tracker row that "Add to
 * Customers" makes goes through the site adapter.
 */
import type { OutreachLeadStatus, OutreachMessageKind, OutreachReplyCategory, Prisma, SocialPlatform } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { normaliseEmail } from "./compliance"
import { DEFAULT_DAILY_CAP, startOfDayUtc } from "./policy"

export type RunKind = "hunt" | "outreach" | "social" | "inbound"
export type RunTrigger = "cron" | "manual" | "webhook"
export type RunStatus = "running" | "ok" | "skipped" | "failed"

/** A run still "running" after this long died without finishing, and no longer blocks a new one. */
const STALE_RUN_MS = 15 * 60_000

// ── Settings ──────────────────────────────────────────────────────────────

export type Settings = { reviewEvery: boolean; paused: boolean; dailyCap: number; signature: boolean }

export async function getSettings(): Promise<Settings> {
  const row = await prisma.outreachAgentSettings.findUnique({ where: { id: 1 } })
  return { reviewEvery: row?.reviewEvery ?? false, paused: row?.paused ?? false, dailyCap: row?.dailyCap ?? DEFAULT_DAILY_CAP, signature: row?.signature ?? false }
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  await prisma.outreachAgentSettings.upsert({ where: { id: 1 }, create: { id: 1, ...patch }, update: patch })
}

// ── Runs ──────────────────────────────────────────────────────────────────

export async function startRun(kind: RunKind, trigger: RunTrigger): Promise<string | null> {
  if (kind !== "inbound") {
    const busy = await prisma.outreachAgentRun.findFirst({ where: { kind, status: "running", startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) } } })
    if (busy) return null
  }
  return (await prisma.outreachAgentRun.create({ data: { kind, trigger, status: "running" } })).id
}

export async function finishRun(id: string, outcome: { status: Exclude<RunStatus, "running">; message: string; count?: number }): Promise<void> {
  await prisma.outreachAgentRun.update({ where: { id }, data: { status: outcome.status, message: outcome.message.slice(0, 2000), count: outcome.count ?? 0, finishedAt: new Date() } })
}

export async function recentRuns(limit = 30) {
  return prisma.outreachAgentRun.findMany({ orderBy: { startedAt: "desc" }, take: limit })
}

// ── Leads ─────────────────────────────────────────────────────────────────

export type NewLead = Omit<Prisma.OutreachLeadCreateInput, "status" | "messages" | "replies" | "trackerContactId" | "email">

/** Stores a lead unless its complaint is already known. True when it was new. */
export async function addLead(lead: NewLead): Promise<boolean> {
  try {
    await prisma.outreachLead.create({ data: { ...lead, status: "NEEDS_CONTACT" } })
    return true
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false
    throw error
  }
}

export async function knownSourceKeys(keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set()
  const rows = await prisma.outreachLead.findMany({ where: { sourceKey: { in: keys } }, select: { sourceKey: true } })
  return new Set(rows.map((r) => r.sourceKey))
}

export async function getLead(id: string) {
  return prisma.outreachLead.findUnique({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } }, replies: { orderBy: { receivedAt: "desc" } } } })
}

/** Leads with their emails and replies, newest first, for the admin tab. */
export async function listLeads(limit = 100) {
  return prisma.outreachLead.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { messages: { orderBy: { createdAt: "asc" } }, replies: { orderBy: { receivedAt: "desc" } } },
  })
}

export async function leadCounts(): Promise<Record<OutreachLeadStatus, number>> {
  const rows = await prisma.outreachLead.groupBy({ by: ["status"], _count: { _all: true } })
  const counts = { NEEDS_CONTACT: 0, READY: 0, CONTACTED: 0, REPLIED: 0, SKIPPED: 0, UNSUBSCRIBED: 0 } as Record<OutreachLeadStatus, number>
  for (const r of rows) counts[r.status] = r._count._all
  return counts
}

/** Gives a lead its address and makes it ready to write to. */
export async function setLeadEmail(id: string, email: string): Promise<boolean> {
  const { count } = await prisma.outreachLead.updateMany({ where: { id, status: { in: ["NEEDS_CONTACT", "READY", "SKIPPED"] } }, data: { email: normaliseEmail(email), status: "READY" } })
  return count > 0
}

export async function setLeadStatus(id: string, status: OutreachLeadStatus): Promise<void> {
  await prisma.outreachLead.update({ where: { id }, data: { status } })
}

export async function setTrackerContact(id: string, trackerContactId: string): Promise<void> {
  await prisma.outreachLead.update({ where: { id }, data: { trackerContactId } })
}

/** The newest lead written to at this address, for matching a reply. */
export async function leadByEmail(email: string) {
  return prisma.outreachLead.findFirst({ where: { email: normaliseEmail(email) }, orderBy: { updatedAt: "desc" } })
}

/** Ready leads with no first email yet (not even a draft), oldest first. */
export async function leadsToWrite(limit: number) {
  return prisma.outreachLead.findMany({ where: { status: "READY", email: { not: null }, messages: { none: { kind: "INITIAL", status: { not: "DISCARDED" } } } }, orderBy: { createdAt: "asc" }, take: limit })
}

/** Contacted leads whose first email went out before `cutoff`, with no follow-up and no reply. */
export async function followUpCandidates(cutoff: Date, limit: number) {
  return prisma.outreachLead.findMany({
    where: {
      status: "CONTACTED",
      replies: { none: {} },
      messages: { some: { kind: "INITIAL", status: "SENT", sentAt: { lte: cutoff } }, none: { kind: "FOLLOW_UP", status: { not: "DISCARDED" } } },
    },
    include: { messages: { where: { kind: "INITIAL", status: "SENT" }, take: 1 } },
    orderBy: { updatedAt: "asc" },
    take: limit,
  })
}

// ── Messages ──────────────────────────────────────────────────────────────

export async function createDraft(input: { leadId: string; kind: OutreachMessageKind; subject: string; body: string; fixId: string; model: string }): Promise<string> {
  return (await prisma.outreachMessage.create({ data: input })).id
}

export async function getMessage(id: string) {
  return prisma.outreachMessage.findUnique({ where: { id }, include: { lead: true } })
}

export async function updateDraft(id: string, patch: { subject?: string; body?: string }): Promise<boolean> {
  const { count } = await prisma.outreachMessage.updateMany({ where: { id, status: "DRAFT" }, data: patch })
  return count > 0
}

/** Claims a draft for sending; false when it is no longer a draft (sent or discarded elsewhere). */
export async function claimDraft(id: string): Promise<boolean> {
  // The status flip is the claim: of two sends of one draft, only one can win it.
  const { count } = await prisma.outreachMessage.updateMany({ where: { id, status: "DRAFT" }, data: { status: "SENT", sentAt: new Date() } })
  return count > 0
}

export async function markSent(id: string, { providerId, auto, leadId, kind }: { providerId: string; auto: boolean; leadId: string; kind: OutreachMessageKind }): Promise<void> {
  await prisma.$transaction([
    prisma.outreachMessage.update({ where: { id }, data: { providerId, autoSent: auto, error: null } }),
    ...(kind === "INITIAL" ? [prisma.outreachLead.update({ where: { id: leadId }, data: { status: "CONTACTED" } })] : []),
  ])
}

/** Undoes a claim after the provider refused: the draft is FAILED with the reason, to retry by hand. */
export async function markFailed(id: string, error: string): Promise<void> {
  await prisma.outreachMessage.update({ where: { id }, data: { status: "FAILED", sentAt: null, error: error.slice(0, 500) } })
}

export async function discardMessage(id: string): Promise<boolean> {
  const { count } = await prisma.outreachMessage.updateMany({ where: { id, status: { in: ["DRAFT", "FAILED"] } }, data: { status: "DISCARDED" } })
  return count > 0
}

/** A failed email back to draft, to try again. */
export async function retryMessage(id: string): Promise<boolean> {
  const { count } = await prisma.outreachMessage.updateMany({ where: { id, status: "FAILED" }, data: { status: "DRAFT", error: null } })
  return count > 0
}

/** Pending drafts and failures for a lead are dropped once it replies or opts out. */
export async function discardOpenMessages(leadId: string): Promise<void> {
  await prisma.outreachMessage.updateMany({ where: { leadId, status: { in: ["DRAFT", "FAILED"] } }, data: { status: "DISCARDED" } })
}

/** Emails sent, ever: the trust gate's count. */
export async function countSent(): Promise<number> {
  return prisma.outreachMessage.count({ where: { status: "SENT", providerId: { not: null } } })
}

export async function countSentSince(since: Date): Promise<number> {
  return prisma.outreachMessage.count({ where: { status: "SENT", sentAt: { gte: since } } })
}

export const sentToday = (now = new Date()) => countSentSince(startOfDayUtc(now))

// ── Replies ───────────────────────────────────────────────────────────────

/** Records a reply; false when this inbound email was already recorded. */
export async function addReply(input: { leadId: string; fromEmail: string; subject: string; text: string; category: OutreachReplyCategory; summary: string; providerId: string | null; source: "inbound" | "manual" }): Promise<boolean> {
  try {
    await prisma.$transaction([prisma.outreachReply.create({ data: { ...input, fromEmail: normaliseEmail(input.fromEmail) } }), prisma.outreachLead.update({ where: { id: input.leadId }, data: { status: "REPLIED" } })])
    return true
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false
    throw error
  }
}

export async function replyCounts(): Promise<{ total: number; interested: number }> {
  const [total, interested] = await Promise.all([prisma.outreachReply.count(), prisma.outreachReply.count({ where: { category: { in: ["INTERESTED", "QUESTION"] } } })])
  return { total, interested }
}

// ── Suppression ───────────────────────────────────────────────────────────

/**
 * Never contact this address again. `markLead` also shows the lead as
 * unsubscribed; off for a plain "not interested", which stays a reply.
 */
export async function suppress(email: string, reason: string, { markLead }: { markLead: boolean }): Promise<void> {
  const address = normaliseEmail(email)
  await prisma.$transaction([
    prisma.outreachSuppression.upsert({ where: { email: address }, create: { email: address, reason }, update: {} }),
    ...(markLead ? [prisma.outreachLead.updateMany({ where: { email: address }, data: { status: "UNSUBSCRIBED" } })] : []),
    prisma.outreachMessage.updateMany({ where: { lead: { email: address }, status: { in: ["DRAFT", "FAILED"] } }, data: { status: "DISCARDED" } }),
  ])
}

export async function isSuppressed(email: string): Promise<boolean> {
  return Boolean(await prisma.outreachSuppression.findUnique({ where: { email: normaliseEmail(email) } }))
}

// ── Social posts ──────────────────────────────────────────────────────────

export async function createPosts(posts: { platform: SocialPlatform; body: string; title?: string | null; description?: string | null; idea?: string | null; batchId?: string | null; model: string }[]): Promise<number> {
  const { count } = await prisma.socialPost.createMany({ data: posts })
  return count
}

export async function listPosts(limit = 30) {
  return prisma.socialPost.findMany({ where: { status: { not: "DISCARDED" } }, orderBy: [{ status: "asc" }, { scheduledFor: "asc" }, { createdAt: "desc" }], take: limit })
}

export async function getPost(id: string) {
  return prisma.socialPost.findUnique({ where: { id } })
}

export async function updatePost(id: string, patch: { body?: string; title?: string | null; description?: string | null; scheduledFor?: Date | null; status?: "DRAFT" | "SCHEDULED" | "DISCARDED" }): Promise<boolean> {
  const { count } = await prisma.socialPost.updateMany({ where: { id, status: { in: ["DRAFT", "SCHEDULED", "FAILED"] } }, data: patch })
  return count > 0
}

/** Claims a post for publishing; false when another call already took it. */
export async function claimPost(id: string): Promise<boolean> {
  const { count } = await prisma.socialPost.updateMany({ where: { id, status: { in: ["DRAFT", "SCHEDULED", "FAILED"] } }, data: { status: "PUBLISHED", publishedAt: new Date(), error: null } })
  return count > 0
}

export async function postPublished(id: string, externalId: string | null): Promise<void> {
  await prisma.socialPost.update({ where: { id }, data: { externalId } })
}

export async function postFailed(id: string, error: string): Promise<void> {
  await prisma.socialPost.update({ where: { id }, data: { status: "FAILED", publishedAt: null, error: error.slice(0, 500) } })
}

export async function duePosts(now: Date) {
  // Only the API platforms: a Reddit, TikTok or YouTube post is never
  // published by the cron, even if one were ever left SCHEDULED.
  // Was: where: { status: "SCHEDULED", scheduledFor: { lte: now } }
  return prisma.socialPost.findMany({ where: { status: "SCHEDULED", scheduledFor: { lte: now }, platform: { in: ["LINKEDIN", "X", "FACEBOOK"] } }, orderBy: { scheduledFor: "asc" }, take: 20 })
}

/**
 * Marks a Reddit, TikTok or YouTube draft as posted by hand, so it moves to
 * the studio's history. Only those platforms, and only an open draft.
 */
export async function markPostedByHand(id: string): Promise<boolean> {
  const { count } = await prisma.socialPost.updateMany({ where: { id, platform: { in: ["REDDIT", "TIKTOK", "YOUTUBE"] }, status: { in: ["DRAFT", "FAILED"] } }, data: { status: "PUBLISHED", publishedAt: new Date(), error: null } })
  return count > 0
}

/** The studio's data: every post that is not discarded, newest first, with the batches they came in. */
export async function studioPosts(limit = 200) {
  return prisma.socialPost.findMany({ where: { status: { not: "DISCARDED" } }, orderBy: { createdAt: "desc" }, take: limit })
}
