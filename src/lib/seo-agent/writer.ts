/**
 * The SEO agent's calls to Claude: write an article for a keyword, write the
 * sentences that link busy pages to it once it is published, and (the page
 * mode that replaced articles) write a template, comparison or law page.
 *
 * Both ask for JSON through structured outputs (a schema the response is
 * constrained to), stream the response so a long article never runs into an
 * HTTP timeout, and re-check what comes back with the same zod schema. The
 * key is ANTHROPIC_API_KEY, read by the SDK; it is never logged or returned.
 *
 * Model: SEO_AGENT_MODEL, or Claude Opus 5.5 by default. Refusals are routed
 * to Anthropic's recommended fallback model (server-side fallbacks), and a
 * response that still refuses, or stops at the token limit, is an error the
 * run log records instead of a half article being saved.
 */
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { z } from "zod"
import { draftSchema, type ArticleDraft } from "./article"
import { articleSystemPrompt, articleUserPrompt, linkSystemPrompt, linkUserPrompt, type ArticleBrief, type LinkSourceBrief } from "./prompt"

export const DEFAULT_MODEL = "claude-opus-5-5"

export function writerModel(): string {
  return process.env.SEO_AGENT_MODEL?.trim() || DEFAULT_MODEL
}

export function hasWriterKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim())
}

let client: Anthropic | null = null
const anthropic = () => (client ??= new Anthropic())

/** One structured call: the system prompt is cached, the reply is parsed against `schema`. */
async function structured<T extends z.ZodType>({ system, user, schema, maxTokens, effort }: { system: string; user: string; schema: T; maxTokens: number; effort: "medium" | "high" }): Promise<{ data: z.infer<T>; model: string }> {
  const stream = anthropic().beta.messages.stream({
    model: writerModel(),
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort, format: betaZodOutputFormat(schema) },
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  })
  const message = await stream.finalMessage()
  if (message.stop_reason === "refusal") throw new Error(`Claude declined to write this${message.stop_details?.category ? ` (${message.stop_details.category})` : ""}`)
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

export async function writeArticle(brief: ArticleBrief): Promise<{ draft: ArticleDraft; model: string }> {
  const { data, model } = await structured({
    system: articleSystemPrompt(brief.siteName),
    user: articleUserPrompt(brief),
    schema: draftSchema,
    maxTokens: 32_000,
    effort: "high",
  })
  return { draft: data, model }
}

const linkSchema = z.object({
  links: z.array(z.object({ path: z.string(), afterParagraph: z.number().int(), sentence: z.string() })),
})

export type LinkSuggestion = z.infer<typeof linkSchema>["links"][number]

export async function writeLinkSentences(input: { siteName: string; article: { title: string; description: string; href: string }; sources: LinkSourceBrief[] }): Promise<LinkSuggestion[]> {
  const { data } = await structured({
    system: linkSystemPrompt(input.siteName),
    user: linkUserPrompt({ article: input.article, sources: input.sources }),
    schema: linkSchema,
    maxTokens: 8_000,
    effort: "medium",
  })
  return data.links
}

/**
 * One page for the page mode (page-agent.ts): any of its draft schemas
 * (page-draft.ts), through the same structured, streamed, re-checked call
 * the articles use.
 */
export async function writePageDraft<T extends z.ZodType>({ system, user, schema }: { system: string; user: string; schema: T }): Promise<{ draft: z.infer<T>; model: string }> {
  const { data, model } = await structured({ system, user, schema, maxTokens: 32_000, effort: "high" })
  return { draft: data, model }
}
