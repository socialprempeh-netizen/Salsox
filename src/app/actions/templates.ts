"use server"

/**
 * Server actions behind "Use this template" (/dashboard/templates/{slug}):
 * create a draft from a template, and save, or delete, a customised copy.
 *
 * Each re-checks the session and re-parses its input; the engine
 * (src/lib/esign/templates.ts) is the authority on plans and ownership.
 * Creating a draft renders and stores a PDF, so it shares the upload's burst
 * limit. Errors come back as the same translated messages the document
 * actions use (esign.errors), with `upgrade` set when a plan would lift them.
 */
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { z } from "zod"
import { getCurrentUser } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getTemplate } from "@/lib/templates"
import { BURST_LIMITS } from "@/lib/esign/sending-limits"
import { createDraftFromTemplate, deleteSavedTemplate, saveTemplate, SAVED_NAME_MAX } from "@/lib/esign/templates"
import { TITLE_MAX } from "@/lib/esign/schemas"

export type TemplateActionState = { ok?: boolean; error?: string; upgrade?: boolean; documentId?: string; savedId?: string }

const valuesSchema = z.record(z.string().max(80), z.string().max(2000)).default({})

async function fail(code: string): Promise<TemplateActionState> {
  const t = await getTranslations("esign.errors")
  return { error: t.has(code) ? t(code) : t("generic"), ...(code.startsWith("plan_") ? { upgrade: true } : {}) }
}

export async function createFromTemplateAction(input: { slug: string; title?: string; values: Record<string, string> }): Promise<TemplateActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  const parsed = z.object({ slug: z.string().max(80), title: z.string().max(TITLE_MAX).optional(), values: valuesSchema }).safeParse(input)
  if (!parsed.success) return fail("invalidInput")
  const template = getTemplate(parsed.data.slug)
  if (!template) return fail("templateNotFound")
  const { max, windowMs } = BURST_LIMITS.upload
  if (!(await checkRateLimit(`esign:upload:${user.id}`, max, windowMs))) return fail("rateLimited")

  const result = await createDraftFromTemplate({
    userId: user.id,
    sender: { name: user.name ?? "", email: user.email ?? "" },
    template,
    values: parsed.data.values,
    title: parsed.data.title,
  })
  if (!result.ok) return fail(result.error)
  revalidatePath("/dashboard/documents")
  return { ok: true, documentId: result.documentId }
}

export async function saveTemplateAction(input: { slug: string; name: string; values: Record<string, string>; id?: string | null }): Promise<TemplateActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  const parsed = z
    .object({ slug: z.string().max(80), name: z.string().trim().min(1).max(SAVED_NAME_MAX), values: valuesSchema, id: z.string().max(40).nullish() })
    .safeParse(input)
  if (!parsed.success) return fail("invalidInput")
  const template = getTemplate(parsed.data.slug)
  if (!template) return fail("templateNotFound")
  const result = await saveTemplate({ userId: user.id, template, name: parsed.data.name, values: parsed.data.values, id: parsed.data.id })
  if (!result.ok) return fail(result.error)
  revalidatePath("/dashboard/templates")
  return { ok: true, savedId: result.id }
}

export async function deleteSavedTemplateAction(id: string): Promise<TemplateActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (typeof id !== "string" || id.length > 40) return fail("invalidInput")
  const result = await deleteSavedTemplate(user.id, id)
  if (!result.ok) return fail(result.error)
  revalidatePath("/dashboard/templates")
  return { ok: true }
}
