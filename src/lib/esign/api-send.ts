/**
 * Creating and sending a document from the public API (POST
 * /api/v1/documents), in the engine, where sending lives.
 *
 * Nothing here is a second way to send. Each request takes a path the
 * product already has, so the rules, the audit trail and the webhooks it
 * fires (document.sent, through recordAudit) are the ones the dashboard gets:
 *
 * - a PDF, every recipient a signer in parallel, no fields given: Quick Send
 *   (`quickSend`), which places a signature and a date for each signer;
 * - a PDF with fields, or with roles or an order Quick Send does not take:
 *   the editor's path, `createDraftFromUpload`, then `saveDocumentSetup` and
 *   `sendDocument`, which is what "Send" in the editor does;
 * - a template: "Use this template" (`createDraftFromTemplate`), the people
 *   filled in, then the editor's path.
 *
 * The request asked for a sent document, not a draft. When the draft was made
 * but the send is refused (a plan rule, an unconfirmed email), the draft is
 * deleted again, so a failed call leaves nothing behind in the account.
 */
import { prisma } from "@/lib/prisma"
import type { Template } from "@/lib/templates"
import type { ApiField, ApiRecipient } from "@/lib/api/documents"
import { createDraftFromUpload, deleteDraft, quickSend, saveDocumentSetup, sendDocument, type Result } from "./documents"
import { createDraftFromTemplate } from "./templates"
import type { z } from "zod"
import { documentSetupSchema, nameFromEmail } from "./schemas"

export type ApiSendArgs = {
  userId: string
  sender: { name: string; email: string }
  title: string
  message?: string
  expiresInDays: number | null
  signingOrder: "PARALLEL" | "SEQUENTIAL"
  recipients: ApiRecipient[]
  source: { kind: "pdf"; bytes: Uint8Array; fields: ApiField[] | null } | { kind: "template"; template: Template; values: Record<string, string>; byRole: Map<string, ApiRecipient> }
}

export type ApiSent = Result<{ documentId: string; undelivered: number; notEmailed: number }>

/** True when Quick Send can take the request as it stands. */
export function fitsQuickSend(args: Pick<ApiSendArgs, "signingOrder" | "recipients">, fields: ApiField[] | null): boolean {
  return fields === null && args.signingOrder === "PARALLEL" && args.recipients.every((r) => r.role === "SIGNER")
}

/** Saves the setup on a draft and sends it, deleting the draft if either step is refused. */
async function setUpAndSend(userId: string, documentId: string, setup: z.input<typeof documentSetupSchema>): Promise<ApiSent> {
  // The editor's schema is the authority on the shape, as it is for the editor.
  const parsed = documentSetupSchema.safeParse(setup)
  const saved = parsed.success ? await saveDocumentSetup(userId, documentId, parsed.data) : ({ ok: false, error: "invalidInput" } as const)
  const sent = saved.ok ? await sendDocument(userId, documentId) : saved
  if (!sent.ok) {
    await deleteDraft(userId, documentId)
    return sent
  }
  return { ok: true, documentId, undelivered: sent.undelivered, notEmailed: sent.notEmailed }
}

export async function sendFromApi(args: ApiSendArgs): Promise<ApiSent> {
  const base = { title: args.title, signingOrder: args.signingOrder, message: args.message, expiresInDays: args.expiresInDays, payment: null, smsReminders: false }

  if (args.source.kind === "pdf") {
    const { bytes, fields } = args.source
    if (fitsQuickSend(args, fields)) {
      return quickSend({
        userId: args.userId,
        title: args.title,
        bytes,
        signers: args.recipients.map((r) => ({ email: r.email, name: r.name })),
        message: args.message,
        expiresInDays: args.expiresInDays,
      })
    }
    // Fields are where a signer signs; the engine will not guess them for an
    // approver, a signing order or anything else Quick Send does not do.
    if (!fields) return { ok: false, error: "fieldsRequired" }
    const draft = await createDraftFromUpload({ userId: args.userId, title: args.title, bytes })
    if (!draft.ok) return draft
    return setUpAndSend(args.userId, draft.documentId, {
      ...base,
      recipients: args.recipients.map((r, i) => ({ key: `r${i}`, name: r.name || nameFromEmail(r.email), email: r.email, role: r.role, order: r.order })),
      fields: fields.map((f) => ({ recipientKey: `r${f.recipientIndex}`, type: f.type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, label: f.label })),
    })
  }

  const { template, values, byRole } = args.source
  const draft = await createDraftFromTemplate({ userId: args.userId, sender: args.sender, template, values, title: args.title })
  if (!draft.ok) return draft
  // The draft has one recipient per role, in the template's order, with the
  // fields already placed at the template's tokens (esign/templates.ts).
  const made = await prisma.document.findUniqueOrThrow({
    where: { id: draft.documentId },
    include: { recipients: { orderBy: { order: "asc" } }, fields: true },
  })
  const recipients = made.recipients.map((r, i) => {
    const role = template.roles[i]
    const person = role && !role.you ? byRole.get(role.id) : undefined
    return { key: r.id, name: person ? person.name || nameFromEmail(person.email) : r.name, email: person ? person.email : r.email, role: "SIGNER" as const, order: r.order }
  })
  return setUpAndSend(args.userId, draft.documentId, {
    ...base,
    recipients,
    fields: made.fields.map((f) => ({ recipientKey: f.recipientId, type: f.type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, label: f.label ?? undefined })),
  })
}
