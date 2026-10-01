"use server"

/**
 * Sender-side server actions for documents and recipients.
 *
 * Thin by design: authenticate, re-parse the input (the server is the
 * authority even when the form already checked), apply the abuse rate limit,
 * call the engine in src/lib/esign, and translate its error code. The
 * business rules live in the engine, not here.
 */
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import {
  cancelDocument,
  createDraftFromUpload,
  deleteDraft,
  quickSend,
  remindDocument,
  renewDocument,
  saveDocumentSetup,
  sendDocument,
} from "@/lib/esign/documents"
import { resendToRecipient, updateRecipient } from "@/lib/esign/recipients"
import { documentSetupSchema, parseEmailList, recipientInputSchema, MAX_RECIPIENTS, TITLE_MAX } from "@/lib/esign/schemas"
import { BURST_LIMITS } from "@/lib/esign/sending-limits"
import { MAX_PDF_MB, parseExpiryChoice } from "@/lib/esign/limits"

/**
 * `undelivered` is how many emails the provider refused on an action that
 * otherwise succeeded (the document is sent, the links are renewed), and
 * `notEmailed` how many were never attempted because this deployment has no
 * email provider. The interface reads both so that it never says "Sent" for
 * an email that was not.
 */
export type ActionState = { error?: string; ok?: boolean; documentId?: string; undelivered?: number; notEmailed?: number }

// Replaced by BURST_LIMITS in src/lib/esign/sending-limits.ts. 120 sends per
// 10 minutes, at 25 recipients each, was 3,000 emails from one account before
// the limiter said anything; the numbers now sit beside the daily ceiling and
// the email-confirmation rule, which the engine enforces on every send.
// /** Generous on purpose: this guards against scripts, not against busy senders. */
// const SEND_LIMIT = { max: 120, windowMs: 10 * 60 * 1000 }

/** One burst bucket per user (or per document, or per recipient) and kind of action. */
function underBurstLimit(kind: keyof typeof BURST_LIMITS, subject: string): Promise<boolean> {
  const { max, windowMs } = BURST_LIMITS[kind]
  return checkRateLimit(`esign:${kind}:${subject}`, max, windowMs)
}

async function errorText(code: string): Promise<string> {
  const t = await getTranslations("esign.errors")
  // `max` is read by the one message that states the recipient cap, so the
  // number shown and the number enforced are the same value.
  // `maxMb` likewise, for the file-size message.
  return t.has(code) ? t(code, { max: MAX_RECIPIENTS, maxMb: MAX_PDF_MB }) : t("generic")
}

async function fail(code: string): Promise<ActionState> {
  return { error: await errorText(code) }
}

async function readPdf(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("file")
  if (!(file instanceof File) || file.size === 0) return null
  return new Uint8Array(await file.arrayBuffer())
}

function titleFrom(formData: FormData, file: FormDataEntryValue | null): string {
  const typed = String(formData.get("title") ?? "").trim()
  const fromFile = file instanceof File ? file.name.replace(/\.pdf$/i, "") : ""
  return (typed || fromFile || "Untitled document").slice(0, TITLE_MAX)
}

function revalidateDocument(id?: string) {
  revalidatePath("/dashboard/documents")
  revalidatePath("/dashboard")
  if (id) revalidatePath(`/dashboard/documents/${id}`)
}

// ─── Create and send ─────────────────────────────────────────────────────────

export async function uploadDocumentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (!(await underBurstLimit("upload", user.id))) return fail("rateLimited")

  const bytes = await readPdf(formData)
  if (!bytes) return fail("noFile")
  const result = await createDraftFromUpload({ userId: user.id, title: titleFrom(formData, formData.get("file")), bytes })
  if (!result.ok) return fail(result.error)
  revalidateDocument()
  return { ok: true, documentId: result.documentId }
}

/** Saves the editor's state (recipients, fields, settings, payment) on a draft. */
export async function saveSetupAction(documentId: string, payload: unknown): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  const parsed = documentSetupSchema.safeParse(payload)
  if (!parsed.success) return fail("invalidInput")
  const result = await saveDocumentSetup(user.id, documentId, parsed.data)
  if (!result.ok) return fail(result.error)
  revalidateDocument(documentId)
  return { ok: true, documentId }
}

/** Save and send in one step, which is what the editor's primary button does. */
export async function saveAndSendAction(documentId: string, payload: unknown): Promise<ActionState> {
  const saved = await saveSetupAction(documentId, payload)
  if (!saved.ok) return saved
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (!(await underBurstLimit("send", user.id))) return fail("rateLimited")
  const sent = await sendDocument(user.id, documentId)
  if (!sent.ok) return fail(sent.error)
  revalidateDocument(documentId)
  return { ok: true, documentId, undelivered: sent.undelivered, notEmailed: sent.notEmailed }
}

export async function quickSendAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (!(await underBurstLimit("send", user.id))) return fail("rateLimited")

  const bytes = await readPdf(formData)
  if (!bytes) return fail("noFile")
  const { emails, invalid } = parseEmailList(String(formData.get("emails") ?? ""))
  if (invalid.length > 0 || emails.length === 0 || emails.length > MAX_RECIPIENTS) return fail("invalidEmails")

  // Replaced by parseExpiryChoice, which reads the default and the ceiling
  // from src/lib/esign/limits.ts instead of repeating 30 and 365 here.
  // const expiryRaw = String(formData.get("expiresInDays") ?? "30")
  // const expiresInDays = expiryRaw === "never" ? null : Math.min(365, Math.max(1, Number.parseInt(expiryRaw, 10) || 30))
  const expiresInDays = parseExpiryChoice(formData.get("expiresInDays")?.toString())

  const result = await quickSend({
    userId: user.id,
    title: titleFrom(formData, formData.get("file")),
    bytes,
    signers: emails,
    message: String(formData.get("message") ?? "").trim().slice(0, 2000) || undefined,
    expiresInDays,
  })
  if (!result.ok) return fail(result.error)
  revalidateDocument(result.documentId)
  return { ok: true, documentId: result.documentId, undelivered: result.undelivered, notEmailed: result.notEmailed }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

async function simple(
  documentId: string,
  run: (userId: string, id: string) => Promise<{ ok: true; undelivered?: number; notEmailed?: number } | { ok: false; error: string }>,
  // Set for the actions that email recipients: a per-document burst budget.
  burst?: keyof typeof BURST_LIMITS
): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (burst && !(await underBurstLimit(burst, String(documentId)))) return fail("rateLimited")
  const result = await run(user.id, documentId)
  if (!result.ok) return fail(result.error)
  revalidateDocument(documentId)
  return { ok: true, documentId, undelivered: result.undelivered ?? 0, notEmailed: result.notEmailed ?? 0 }
}

// Renewing and reminding each email every pending signer, so they share one
// small per-document budget: nobody needs to nudge the same people more than
// a few times an hour.
export async function renewDocumentAction(documentId: string) {
  return simple(documentId, renewDocument, "nudge")
}

export async function remindDocumentAction(documentId: string) {
  return simple(documentId, remindDocument, "nudge")
}

export async function cancelDocumentAction(documentId: string) {
  return simple(documentId, cancelDocument)
}

export async function deleteDraftAction(documentId: string) {
  return simple(documentId, deleteDraft)
}

// ─── Recipients ──────────────────────────────────────────────────────────────

const editableRecipient = recipientInputSchema.pick({ name: true, email: true, phone: true })

export async function updateRecipientAction(
  recipientId: string,
  documentId: string,
  input: unknown
): Promise<ActionState & { tokenRotated?: boolean; emailFailed?: boolean; emailNotConfigured?: boolean }> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  const parsed = editableRecipient.safeParse(input)
  if (!parsed.success) return fail("invalidInput")
  // A corrected address is emailed a new invite, so edits are budgeted too.
  if (!(await underBurstLimit("recipientEdit", user.id))) return fail("rateLimited")
  const result = await updateRecipient(user.id, recipientId, parsed.data)
  if (!result.ok) return fail(result.error)
  revalidateDocument(documentId)
  return { ok: true, documentId, tokenRotated: result.tokenRotated, emailFailed: result.emailFailed, emailNotConfigured: result.notEmailed }
}

export async function resendRecipientAction(recipientId: string, documentId: string): Promise<ActionState> {
  const user = await getCurrentUser()
  if (!user) return fail("unauthorized")
  if (!(await checkRateLimit(`esign:resend:${recipientId}`, 5, 60 * 60 * 1000))) return fail("rateLimited")
  const result = await resendToRecipient(user.id, recipientId)
  if (!result.ok) return fail(result.error)
  revalidateDocument(documentId)
  return { ok: true, documentId }
}
