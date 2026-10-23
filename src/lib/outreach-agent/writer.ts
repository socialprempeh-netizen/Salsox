/**
 * The outreach agent's calls to Claude: Hunter's extraction of complaints
 * from a page or post, Marco's first email, Oscar's follow-up, Leo's reply
 * label, and the social posts.
 *
 * Same pattern as the SEO agent's writer (src/lib/seo-agent/writer.ts): JSON
 * through structured outputs, streamed, re-checked against the same zod
 * schema, refusals routed to Anthropic's fallback model and an answer that
 * still refuses or runs out of room treated as an error the run log records.
 * The key is ANTHROPIC_API_KEY, read by the SDK; never logged or returned.
 *
 * Models: OUTREACH_AGENT_MODEL writes the emails and posts (Claude Opus 5.5
 * by default); OUTREACH_AGENT_FAST_MODEL reads pages and labels replies
 * (Claude Haiku 5.5 by default), the high-volume, simple jobs.
 */
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"
import { COMPLAINTS } from "./fixes"
import {
  classifySystemPrompt,
  classifyUserPrompt,
  emailSystemPrompt,
  emailUserPrompt,
  extractPostPrompt,
  extractReviewsPrompt,
  extractSystemPrompt,
  followUpSystemPrompt,
  followUpUserPrompt,
  socialSystemPrompt,
  socialUserPrompt,
  type EmailBrief,
  type FollowUpBrief,
} from "./prompt"
import type { Fix } from "./fixes"
import type { LeadSource } from "./sources"

export const DEFAULT_MODEL = "claude-opus-5-5"
export const DEFAULT_FAST_MODEL = "claude-haiku-5-5"

export const writerModel = () => process.env.OUTREACH_AGENT_MODEL?.trim() || DEFAULT_MODEL
export const fastModel = () => process.env.OUTREACH_AGENT_FAST_MODEL?.trim() || DEFAULT_FAST_MODEL

export function hasWriterKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic())

async function structured<T extends z.ZodType>({ model, system, user, schema, maxTokens, effort }: { model: string; system: string; user: string; schema: T; maxTokens: number; effort: "low" | "medium" | "high" }): Promise<{ data: z.infer<T>; model: string }> {
  const stream = anthropic().beta.messages.stream({
    model,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === "refusal") throw new Error(`Claude declined${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}`)
  if (message.stop_reason === "max_tokens") throw new Error("Claude ran out of room before finishing")
  const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("")
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error("Claude's answer was not valid JSON")
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) throw new Error(`Claude's answer did not match the schema: ${parsed.error.issues[0]?.message ?? "unknown"}`)
  return { data: parsed.data, model: message.model }
}

// ── Hunter ────────────────────────────────────────────────────────────────

const extractSchema = z.object({
  signals: z.array(
    z.object({
      rating: z.number().nullable(),
      quote: z.string(),
      complaint: z.enum(COMPLAINTS),
      reviewerName: z.string().nullable(),
      reviewerRole: z.string().nullable(),
      company: z.string().nullable(),
      reviewId: z.string().nullable(),
    })
  ),
})

export type ExtractedSignal = z.infer<typeof extractSchema>["signals"][number]

export async function extractFromReviews(input: { competitor: string; source: LeadSource; url: string; markdown: string }): Promise<ExtractedSignal[]> {
  const { data } = await structured({ model: fastModel(), system: extractSystemPrompt(), user: extractReviewsPrompt(input), schema: extractSchema, maxTokens: 8_000, effort: "low" })
  return data.signals
}

export async function extractFromPost(input: { competitor: string; title: string; text: string; url: string }): Promise<ExtractedSignal[]> {
  const { data } = await structured({ model: fastModel(), system: extractSystemPrompt(), user: extractPostPrompt(input), schema: extractSchema, maxTokens: 2_000, effort: "low" })
  return data.signals
}

// ── Marco and Oscar ───────────────────────────────────────────────────────

const emailSchema = z.object({ subject: z.string(), body: z.string() })
const followUpSchema = z.object({ body: z.string() })

export async function writeEmail(brief: EmailBrief, feedback?: string[]): Promise<{ subject: string; body: string; model: string }> {
  const user = feedback?.length ? `${emailUserPrompt(brief)}\n\nYour previous draft had these problems; fix every one:\n${feedback.map((f) => `- ${f}`).join("\n")}` : emailUserPrompt(brief)
  const { data, model } = await structured({ model: writerModel(), system: emailSystemPrompt(brief.siteName), user, schema: emailSchema, maxTokens: 4_000, effort: "medium" })
  return { ...data, model }
}

export async function writeFollowUp(brief: FollowUpBrief, feedback?: string[]): Promise<{ body: string; model: string }> {
  const user = feedback?.length ? `${followUpUserPrompt(brief)}\n\nYour previous draft had these problems; fix every one:\n${feedback.map((f) => `- ${f}`).join("\n")}` : followUpUserPrompt(brief)
  const { data, model } = await structured({ model: writerModel(), system: followUpSystemPrompt(brief.siteName), user, schema: followUpSchema, maxTokens: 3_000, effort: "medium" })
  return { ...data, model }
}

// ── Leo ───────────────────────────────────────────────────────────────────

export const REPLY_CATEGORIES = ["INTERESTED", "QUESTION", "NOT_NOW", "NOT_INTERESTED", "UNSUBSCRIBE", "OUT_OF_OFFICE", "OTHER"] as const
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number]

const classifySchema = z.object({ category: z.enum(REPLY_CATEGORIES), summary: z.string() })

export async function classifyReply(input: { subject: string; text: string }): Promise<{ category: ReplyCategory; summary: string }> {
  const { data } = await structured({ model: fastModel(), system: classifySystemPrompt(), user: classifyUserPrompt(input), schema: classifySchema, maxTokens: 1_000, effort: "low" })
  return { category: data.category, summary: data.summary.slice(0, 300) }
}

// ── Social ────────────────────────────────────────────────────────────────

// Was platform: z.enum(["FACEBOOK", "LINKEDIN", "X"]) and a body alone.
// Reddit, TikTok and YouTube also take a title, and TikTok and YouTube a
// description; platforms without one return an empty string for it.
const socialSchema = z.object({
  posts: z.array(z.object({ platform: z.enum(["FACEBOOK", "LINKEDIN", "X", "REDDIT", "TIKTOK", "YOUTUBE"]), body: z.string(), title: z.string(), description: z.string() })),
})

export type SocialDraft = z.infer<typeof socialSchema>["posts"][number]

export async function writeSocialPosts(input: { siteName: string; productSummary: string; fixes: Fix[]; platforms: SocialDraft["platform"][]; theme?: string }): Promise<{ posts: SocialDraft[]; model: string }> {
  const { data, model } = await structured({ model: writerModel(), system: socialSystemPrompt(input.siteName), user: socialUserPrompt(input), schema: socialSchema, maxTokens: 6_000, effort: "medium" })
  return { posts: data.posts.filter((p) => input.platforms.includes(p.platform)), model }
}
