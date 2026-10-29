"use server"

/**
 * Server actions behind the Outreach agent tab (/admin/outreach/agent): run
 * the hunt or the outreach now, check the crawler connection, give a lead its address or skip it, approve,
 * edit, discard or retry an email, log a reply by hand, add a lead to the
 * Outreach tracker, change the sending settings, and draft, schedule and
 * publish social posts (from the social studio, /admin/outreach/social:
 * Reddit, TikTok and YouTube drafts are edited and marked posted here, never
 * scheduled or published).
 *
 * Admin only, checked on every call: an action is a public endpoint whatever
 * page renders it. Every argument is re-parsed here, and the work itself is
 * done by src/lib/outreach-agent, never re-implemented. Outcomes come back as
 * the agent's own sentence; errors as keys the page translates.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getAdminUser } from "@/lib/auth"
import { addToCustomers, draftSocialPosts, logReplyByHand, planPublishAll, publishAllDrafts, publishPost, runHunt, runOutreach, sendMessage, type PublishAllItem } from "@/lib/outreach-agent/agent"
import { checkCrawler } from "@/lib/outreach-agent/crawl4ai"
import { clampCap } from "@/lib/outreach-agent/policy"
import { draftProblems, isAutoPlatform } from "@/lib/outreach-agent/social"
import { salsoxOutreach } from "@/lib/outreach-agent/site"
import * as store from "@/lib/outreach-agent/store"

export type OutreachAgentResult = { ok: true; message?: string } | { ok: false; error: "notFound" | "invalid" | "failed"; message?: string }

const PATH = "/admin/outreach/agent"
const STUDIO = "/admin/outreach/social"
const id = z.string().min(1).max(64)

async function requireAdmin() {
  // Was getCurrentUser(): admins also need 2FA, passed on this session
  // (src/lib/two-factor-policy.ts), so a role alone no longer opens this.
  const user = await getAdminUser()
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized")
}

const done = (ok: boolean, message?: string): OutreachAgentResult => {
  revalidatePath(PATH)
  revalidatePath(STUDIO)
  return ok ? { ok: true, message } : { ok: false, error: "failed", message }
}

// ── Runs ──────────────────────────────────────────────────────────────────

export async function huntNow(): Promise<OutreachAgentResult> {
  await requireAdmin()
  const result = await runHunt(salsoxOutreach, "manual")
  return done(result.status !== "failed", result.message)
}

/** Asks the crawler for one neutral page, to prove CRAWL4AI_URL and its token work. */
export async function checkCrawlerNow(): Promise<OutreachAgentResult> {
  await requireAdmin()
  const result = await checkCrawler({ userAgent: salsoxOutreach.userAgent })
  console.info("[outreach-agent] crawler check:", result.message)
  return result.ok ? { ok: true, message: result.message } : { ok: false, error: "failed", message: result.message }
}

export async function runOutreachNow(): Promise<OutreachAgentResult> {
  await requireAdmin()
  const result = await runOutreach(salsoxOutreach, "manual")
  return done(result.status !== "failed", result.message)
}

// ── Leads ─────────────────────────────────────────────────────────────────

const contactInput = z.object({ leadId: id, email: z.string().trim().toLowerCase().email().max(254) })

export async function setLeadContact(leadId: string, email: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = contactInput.safeParse({ leadId, email })
  if (!parsed.success) return { ok: false, error: "invalid" }
  if (await store.isSuppressed(parsed.data.email)) return { ok: false, error: "invalid", message: "suppressed" }
  if (!(await store.setLeadEmail(parsed.data.leadId, parsed.data.email))) return { ok: false, error: "notFound" }
  return done(true)
}

export async function skipLead(leadId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(leadId).success) return { ok: false, error: "invalid" }
  const lead = await store.getLead(leadId)
  if (!lead) return { ok: false, error: "notFound" }
  await store.setLeadStatus(leadId, "SKIPPED")
  await store.discardOpenMessages(leadId)
  return done(true)
}

export async function logReply(leadId: string, text: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = z.object({ leadId: id, text: z.string().trim().min(1).max(8_000) }).safeParse({ leadId, text })
  if (!parsed.success) return { ok: false, error: "invalid" }
  const result = await logReplyByHand(salsoxOutreach, parsed.data.leadId, parsed.data.text)
  if (!result.ok) return { ok: false, error: "notFound" }
  return done(true, result.category)
}

export async function addLeadToCustomers(leadId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(leadId).success) return { ok: false, error: "invalid" }
  const result = await addToCustomers(salsoxOutreach, leadId)
  if (!result.ok) return { ok: false, error: "notFound" }
  return done(true, result.already ? "already" : undefined)
}

// ── Emails ────────────────────────────────────────────────────────────────

export async function sendDraft(messageId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(messageId).success) return { ok: false, error: "invalid" }
  const result = await sendMessage(salsoxOutreach, messageId, { auto: false })
  return done(result.ok, result.message)
}

const draftInput = z.object({ messageId: id, subject: z.string().trim().min(3).max(120), body: z.string().trim().min(20).max(4_000) })

export async function saveDraft(messageId: string, subject: string, body: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = draftInput.safeParse({ messageId, subject, body })
  if (!parsed.success) return { ok: false, error: "invalid" }
  if (!(await store.updateDraft(parsed.data.messageId, { subject: parsed.data.subject, body: parsed.data.body }))) return { ok: false, error: "notFound" }
  return done(true)
}

export async function discardDraft(messageId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(messageId).success) return { ok: false, error: "invalid" }
  if (!(await store.discardMessage(messageId))) return { ok: false, error: "notFound" }
  return done(true)
}

export async function retryDraft(messageId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(messageId).success) return { ok: false, error: "invalid" }
  if (!(await store.retryMessage(messageId))) return { ok: false, error: "notFound" }
  return done(true)
}

// ── Settings ──────────────────────────────────────────────────────────────

const settingsInput = z.object({ reviewEvery: z.boolean(), paused: z.boolean(), dailyCap: z.number().int(), signature: z.boolean() }).partial()

export async function updateOutreachSettings(patch: { reviewEvery?: boolean; paused?: boolean; dailyCap?: number; signature?: boolean }): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = settingsInput.safeParse(patch)
  if (!parsed.success || Object.keys(parsed.data).length === 0) return { ok: false, error: "invalid" }
  await store.updateSettings({ ...parsed.data, ...(parsed.data.dailyCap !== undefined ? { dailyCap: clampCap(parsed.data.dailyCap) } : {}) })
  return done(true)
}

// ── Social ────────────────────────────────────────────────────────────────

// Was z.enum(["FACEBOOK", "LINKEDIN", "X"]) and at most three: the studio
// drafts for all six platforms from one idea.
const platform = z.enum(["FACEBOOK", "LINKEDIN", "X", "REDDIT", "TIKTOK", "YOUTUBE"])

export async function draftPosts(platforms: string[], theme: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = z.object({ platforms: z.array(platform).min(1).max(6), theme: z.string().trim().max(300) }).safeParse({ platforms, theme })
  if (!parsed.success) return { ok: false, error: "invalid" }
  const result = await draftSocialPosts(salsoxOutreach, { platforms: [...new Set(parsed.data.platforms)], theme: parsed.data.theme || undefined })
  return done(result.ok, result.message)
}

/**
 * Saves an edited post. `extra` carries the title and description Reddit,
 * TikTok and YouTube have; the whole draft is re-checked against its
 * platform's limits (draftProblems) before it is stored.
 */
export async function savePost(postId: string, body: string, extra: { title?: string; description?: string } = {}): Promise<OutreachAgentResult> {
  await requireAdmin()
  // Was body only, at most 5,000 characters: a Reddit body can be 40,000.
  const parsed = z
    .object({ postId: id, body: z.string().trim().min(1).max(40_000), title: z.string().trim().max(300).optional(), description: z.string().trim().max(5_000).optional() })
    .safeParse({ postId, body, ...extra })
  if (!parsed.success) return { ok: false, error: "invalid" }
  const post = await store.getPost(parsed.data.postId)
  if (!post) return { ok: false, error: "notFound" }
  const fields = { body: parsed.data.body, title: parsed.data.title ?? post.title, description: parsed.data.description ?? post.description }
  if (draftProblems(post.platform, fields).length) return { ok: false, error: "invalid" }
  const patch = isAutoPlatform(post.platform) ? { body: fields.body } : fields
  if (!(await store.updatePost(parsed.data.postId, patch))) return { ok: false, error: "notFound" }
  return done(true)
}

/** Marks a Reddit, TikTok or YouTube draft as posted by hand. */
export async function markPosted(postId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(postId).success) return { ok: false, error: "invalid" }
  if (!(await store.markPostedByHand(postId))) return { ok: false, error: "notFound" }
  return done(true)
}

/** Schedules a post for an ISO time in the future, or back to draft with null. */
export async function schedulePost(postId: string, when: string | null): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(postId).success) return { ok: false, error: "invalid" }
  // Only the API platforms can be scheduled; the others are posted by hand.
  const post = await store.getPost(postId)
  if (!post) return { ok: false, error: "notFound" }
  if (!isAutoPlatform(post.platform)) return { ok: false, error: "invalid" }
  if (when === null) return (await store.updatePost(postId, { status: "DRAFT", scheduledFor: null })) ? done(true) : { ok: false, error: "notFound" }
  const date = new Date(when)
  if (Number.isNaN(date.getTime()) || date.getTime() < Date.now() - 60_000) return { ok: false, error: "invalid" }
  return (await store.updatePost(postId, { status: "SCHEDULED", scheduledFor: date })) ? done(true) : { ok: false, error: "notFound" }
}

export async function publishPostNow(postId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(postId).success) return { ok: false, error: "invalid" }
  const result = await publishPost(salsoxOutreach, postId)
  return done(result.ok, result.message)
}

/** What "Publish all pending drafts" would do, without publishing anything: shown for confirmation. */
export async function previewPublishAll(): Promise<{ ok: true; items: PublishAllItem[] } | { ok: false }> {
  await requireAdmin()
  try {
    return { ok: true, items: await planPublishAll() }
  } catch (error) {
    console.error("[outreach-agent] could not plan publish-all:", error instanceof Error ? error.message : error)
    return { ok: false }
  }
}

export type PublishAllResult = { ok: true; message: string; results: (PublishAllItem & { ok: boolean; message: string })[] } | { ok: false; message?: string }

/** Publishes every pending draft on a working platform, one at a time, and reports each. */
export async function publishAllDraftsNow(): Promise<PublishAllResult> {
  await requireAdmin()
  try {
    const { results, message } = await publishAllDrafts(salsoxOutreach)
    revalidatePath(PATH)
    revalidatePath(STUDIO)
    return { ok: true, message, results }
  } catch (error) {
    console.error("[outreach-agent] publish-all failed:", error instanceof Error ? error.message : error)
    return { ok: false }
  }
}

export async function discardPost(postId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(postId).success) return { ok: false, error: "invalid" }
  if (!(await store.updatePost(postId, { status: "DISCARDED" }))) return { ok: false, error: "notFound" }
  return done(true)
}
