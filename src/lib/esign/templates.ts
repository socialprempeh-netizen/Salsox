/**
 * The signing engine's side of the template library: turning a template
 * (src/lib/templates.ts) and the values someone typed into a draft document
 * that opens in the ordinary editor, ready to send.
 *
 * What a template draft is, so nothing downstream needs to know it came from
 * one:
 * - the PDF rendered from the filled-in document (templates-pdf.ts), stored
 *   and inspected through createDraftFromUpload, like any upload;
 * - one recipient per template role, in order. The role marked `you` is the
 *   sender, filled with their own name and email; the others are named after
 *   the role ("Client", "Tenant") with an empty email, for the sender to fill
 *   in the editor. sendDocument refuses a draft while any email is missing;
 * - a field at every signature, initials, date and name token, assigned to its
 *   role's recipient, at the position the renderer measured.
 *
 * Blanks left empty print as a line to fill by hand, never as "[Blank]".
 */
import { prisma } from "@/lib/prisma"
import { fillVariables, type Template } from "@/lib/templates"
import { renderTemplatePdf, type PlacedField } from "@/lib/templates-pdf"
import type { FieldType } from "@prisma/client"
import { createDraftFromUpload, type Result } from "./documents"
import { newSigningToken } from "./tokens"
import { TITLE_MAX } from "./schemas"
import { senderPlan } from "./sender"
import { hasFeature, planErrorCode } from "./plans"

const FIELD_TYPE: Record<PlacedField["kind"], FieldType> = { signature: "SIGNATURE", initials: "INITIALS", date: "DATE", name: "NAME", text: "TEXT" }

/** A blank nobody filled in, as printed: a line long enough to write on. */
export const EMPTY_BLANK = "____________"

/** Only the template's own variables, trimmed and capped: anything else typed is ignored. */
export function cleanValues(template: Pick<Template, "variables">, values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const name of Object.keys(template.variables)) {
    const value = values[name]
    if (typeof value === "string" && value.trim()) out[name] = value.trim().slice(0, 500)
  }
  return out
}

/** The draft's recipients: one per role, the sender's own role filled in. */
export function templateRecipients(template: Pick<Template, "roles">, sender: { name: string; email: string }) {
  return template.roles.map((role, index) => ({
    roleId: role.id,
    name: role.you ? sender.name || role.label : role.label,
    email: role.you ? sender.email : "",
    order: index,
  }))
}

export async function createDraftFromTemplate(args: {
  userId: string
  sender: { name: string; email: string }
  template: Template
  values: Record<string, unknown>
  title?: string
}): Promise<Result<{ documentId: string }>> {
  const values = cleanValues(args.template, args.values)
  const markdown = fillVariables(args.template.body, values, () => EMPTY_BLANK)
  const title = (args.title?.trim() || args.template.h1).slice(0, TITLE_MAX)
  // No footer: a sent document is the sender's, not an advert for the library.
  const { bytes, fields } = await renderTemplatePdf({ title, markdown, footer: "" })

  const draft = await createDraftFromUpload({ userId: args.userId, title, bytes })
  if (!draft.ok) return { ok: false, error: draft.error }

  const recipients = templateRecipients(args.template, args.sender)
  await prisma.$transaction(async (tx) => {
    const idByRole = new Map<string, string>()
    for (const r of recipients) {
      const created = await tx.recipient.create({
        data: { documentId: draft.documentId, name: r.name, email: r.email, role: "SIGNER", order: r.order, token: newSigningToken() },
      })
      idByRole.set(r.roleId, created.id)
    }
    await tx.field.createMany({
      data: fields.map((f) => ({
        documentId: draft.documentId,
        recipientId: idByRole.get(f.role)!,
        type: FIELD_TYPE[f.kind],
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
        required: true,
      })),
    })
  })
  return { ok: true, documentId: draft.documentId }
}

// ─── Saved templates ─────────────────────────────────────────────────────────

/** How many customised templates one account may keep. */
export const MAX_SAVED_TEMPLATES = 100
export const SAVED_NAME_MAX = 80

/**
 * Saves a customised copy of a template: the values typed into its blanks,
 * under a name. Creates one, or updates the user's own `id`. A Personal-plan
 * feature (savedTemplates); the plan is checked here, not only in the page.
 */
export async function saveTemplate(args: {
  userId: string
  template: Template
  name: string
  values: Record<string, unknown>
  id?: string | null
}): Promise<Result<{ id: string }>> {
  const { tier } = await senderPlan(args.userId)
  if (!hasFeature(tier, "savedTemplates")) return { ok: false, error: planErrorCode("savedTemplates") }
  const name = args.name.trim().slice(0, SAVED_NAME_MAX)
  if (!name) return { ok: false, error: "invalidInput" }
  const values = cleanValues(args.template, args.values)

  if (args.id) {
    const { count } = await prisma.savedTemplate.updateMany({ where: { id: args.id, userId: args.userId }, data: { name, values } })
    return count === 0 ? { ok: false, error: "notFound" } : { ok: true, id: args.id }
  }
  const existing = await prisma.savedTemplate.count({ where: { userId: args.userId } })
  if (existing >= MAX_SAVED_TEMPLATES) return { ok: false, error: "tooManySavedTemplates" }
  const created = await prisma.savedTemplate.create({ data: { userId: args.userId, templateSlug: args.template.slug, name, values } })
  return { ok: true, id: created.id }
}

export async function deleteSavedTemplate(userId: string, id: string): Promise<Result> {
  const { count } = await prisma.savedTemplate.deleteMany({ where: { id, userId } })
  return count === 0 ? { ok: false, error: "notFound" } : { ok: true }
}

export function listSavedTemplates(userId: string) {
  return prisma.savedTemplate.findMany({ where: { userId }, orderBy: { updatedAt: "desc" }, select: { id: true, name: true, templateSlug: true, updatedAt: true } })
}

/** One of the user's saved templates, with its values as strings. */
export async function getSavedTemplate(userId: string, id: string) {
  const saved = await prisma.savedTemplate.findFirst({ where: { id, userId } })
  if (!saved) return null
  const raw = (saved.values ?? {}) as Record<string, unknown>
  const values = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")) as Record<string, string>
  return { id: saved.id, name: saved.name, templateSlug: saved.templateSlug, values }
}
