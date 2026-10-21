"use server"

/**
 * Server actions behind the Outreach agent tab (/admin/outreach/agent): run
 * the hunt or the outreach now, give a lead its address or skip it, approve,
 * edit, discard or retry an email, log a reply by hand, add a lead to the
 * Outreach tracker, change the sending settings, and draft, schedule and
 * publish social posts.
 *
 * Admin only, checked on every call: an action is a public endpoint whatever
 * page renders it. Every argument is re-parsed here, and the work itself is
 * done by src/lib/outreach-agent, never re-implemented. Outcomes come back as
 * the agent's own sentence; errors as keys the page translates.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { addToCustomers, draftSocialPosts, logReplyByHand, publishPost, runHunt, runOutreach, sendMessage } from "@/lib/outreach-agent/agent"
import { clampCap } from "@/lib/outreach-agent/policy"
import { salsoxOutreach } from "@/lib/outreach-agent/site"
import * as store from "@/lib/outreach-agent/store"

export type OutreachAgentResult = { ok: true; message?: string } | { ok: false; error: "notFound" | "invalid" | "failed"; message?: string }

const PATH = "/admin/outreach/agent"
const id = z.string().min(1).max(64)

async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized")
}

const done = (ok: boolean, message?: string): OutreachAgentResult => {
  revalidatePath(PATH)
  return ok ? { ok: true, message } : { ok: false, error: "failed", message }
}

// ── Runs ──────────────────────────────────────────────────────────────────

export async function huntNow(): Promise<OutreachAgentResult> {
  await requireAdmin()
  const result = await runHunt(salsoxOutreach, "manual")
  return done(result.status !== "failed", result.message)
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

const platform = z.enum(["FACEBOOK", "LINKEDIN", "X"])

export async function draftPosts(platforms: string[], theme: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = z.object({ platforms: z.array(platform).min(1).max(3), theme: z.string().trim().max(300) }).safeParse({ platforms, theme })
  if (!parsed.success) return { ok: false, error: "invalid" }
  const result = await draftSocialPosts(salsoxOutreach, { platforms: [...new Set(parsed.data.platforms)], theme: parsed.data.theme || undefined })
  return done(result.ok, result.message)
}

export async function savePost(postId: string, body: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  const parsed = z.object({ postId: id, body: z.string().trim().min(1).max(5_000) }).safeParse({ postId, body })
  if (!parsed.success) return { ok: false, error: "invalid" }
  if (!(await store.updatePost(parsed.data.postId, { body: parsed.data.body }))) return { ok: false, error: "notFound" }
  return done(true)
}

/** Schedules a post for an ISO time in the future, or back to draft with null. */
export async function schedulePost(postId: string, when: string | null): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(postId).success) return { ok: false, error: "invalid" }
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

export async function discardPost(postId: string): Promise<OutreachAgentResult> {
  await requireAdmin()
  if (!id.safeParse(postId).success) return { ok: false, error: "invalid" }
  if (!(await store.updatePost(postId, { status: "DISCARDED" }))) return { ok: false, error: "notFound" }
  return done(true)
}
