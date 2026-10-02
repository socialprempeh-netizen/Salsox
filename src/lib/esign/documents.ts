/**
 * Sender-side document lifecycle: upload → set up → send → (renew | cancel)
 * → finalize, plus Quick Send and the scheduled sweeps.
 *
 * Every function takes the acting user's id and checks ownership itself;
 * server actions are thin wrappers that parse input and translate errors.
 * Functions return `{ ok: false, error }` codes for expected failures (the
 * action maps them to translated messages) and throw only on the unexpected.
 *
 * Note on sending limits: no plan has an envelope cap, and nothing in this
 * file consults the plan. That is a product decision, not an omission. What
 * every path that emails recipients does ask is `senderBlocker` (sender.ts):
 * the sender's own email must be confirmed, and a daily abuse ceiling applies
 * to every account alike (sending-limits.ts). The burst rate limiter in the
 * actions sits on top of that.
 *
 * Previous note, superseded when the email-confirmation rule and the daily
 * ceiling were added (the in-memory rate limiter alone left sending open to
 * unconfirmed accounts):
 *   Note on sending limits: there are none. Nothing in this file counts
 *   documents or consults the plan. That is a product decision (no envelope
 *   caps), not an omission. Abuse protection is the rate limiter in the actions.
 */
import { randomUUID } from "node:crypto"
import type { DocumentStatus, Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { AUDIT, recordAudit, requestMeta } from "./audit"
import { deleteFile, deleteFolder, documentKey, getFile, putFile, sealedDocumentKey, sha256, userFolder } from "./storage"
import { inspectPdf, type PdfInspection } from "./pdf/inspect"
import { sealDocument } from "./pdf/seal"
import { newSigningToken } from "./tokens"
import {
  canRenewDocument,
  computeExpiry,
  finalizeStep,
  isActionable,
  isStuckFinalization,
  recipientsToNotify,
  shouldExpireDocument,
  type RuleRecipient,
} from "./rules"
import { autoPlaceFields } from "./quick-send"
import { chooseProvider, formatMinorUnits, isSignAndPayCurrency, toMinorUnits } from "./payments/select"
import { nameFromEmail, type DocumentSetup } from "./schemas"
import { signingUrl } from "./share"
import { sendDocumentCompleted, sendDocumentExpired, sendSigningInvite } from "./emails"
import { senderBlocker, senderPlan } from "./sender"
import { hasFeature, planErrorCode, setupBlocker, tierForEntitlement } from "./plans"
import { getEntitlement } from "@/lib/billing"
import { DEFAULT_EXPIRY_DAYS } from "./limits"
import { closeOpenCheckouts } from "./payments/settle"

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export const appUrl = () => siteConfig.url

// Replaced by DEFAULT_EXPIRY_DAYS in ./limits: this 30 was declared in both
// documents.ts and recipients.ts, and is also the default a new document gets.
// /** Fallback when a document was created without an explicit expiry setting. */
// const DEFAULT_RENEW_DAYS = 30

// ─── Upload ───────────────────────────────────────────────────────────────────

export async function createDraftFromUpload(args: {
  userId: string
  title: string
  bytes: Uint8Array
}): Promise<Result<{ documentId: string }> | { ok: false; error: Exclude<PdfInspection, { ok: true }>["reason"] }> {
  const inspection = await inspectPdf(args.bytes)
  if (!inspection.ok) return { ok: false, error: inspection.reason }

  // The storage folder is a random id, not the row id: the file is written
  // before the row exists, so a failed insert leaves an orphan file rather than
  // a row pointing at nothing.
  const key = documentKey(args.userId, randomUUID(), "original")
  await putFile(key, args.bytes)

  const document = await prisma.document.create({
    data: {
      userId: args.userId,
      title: args.title,
      originalKey: key,
      originalSha256: sha256(args.bytes),
      pageCount: inspection.pageCount,
    },
  })
  await recordAudit(prisma, {
    documentId: document.id,
    type: AUDIT.CREATED,
    data: { pageCount: inspection.pageCount },
    meta: await requestMeta(),
  })
  return { ok: true, documentId: document.id }
}

// ─── Setup (recipients, fields, payment) ─────────────────────────────────────

/**
 * Replaces a draft's recipients and fields in one transaction. Only drafts can
 * be set up this way; a sent document changes through the recipient actions,
 * which preserve what has already been signed.
 */
export async function saveDocumentSetup(userId: string, documentId: string, setup: DocumentSetup): Promise<Result> {
  const document = await prisma.document.findFirst({ where: { id: documentId, userId } })
  if (!document) return { ok: false, error: "notFound" }
  if (document.status !== "DRAFT") return { ok: false, error: "notDraft" }

  // Business features on a lower plan are refused here, not saved and
  // silently honoured: the editor locks them, and this is the authority.
  const { tier } = await senderPlan(userId)
  const gated = setupBlocker(tier, { signingOrder: setup.signingOrder, recipients: setup.recipients, hasPayment: Boolean(setup.payment) })
  if (gated) return { ok: false, error: planErrorCode(gated) }

  const keys = new Set(setup.recipients.map((r) => r.key))
  if (keys.size !== setup.recipients.length) return { ok: false, error: "invalidInput" }
  // Quick Send may reference one appended page; the editor may not.
  if (setup.fields.some((f) => !keys.has(f.recipientKey) || f.page > document.pageCount)) {
    return { ok: false, error: "invalidInput" }
  }

  let payment: { amount: number; currency: string; provider: "STRIPE" | "PAYSTACK"; recipientKey: string } | null = null
  if (setup.payment) {
    // Checked here as well as in the schema: this function is the authority,
    // and a currency outside the list turns the amount into the wrong charge.
    if (!isSignAndPayCurrency(setup.payment.currency)) return { ok: false, error: "invalidCurrency" }
    const amount = toMinorUnits(setup.payment.amount)
    if (!amount || amount < 100) return { ok: false, error: "invalidAmount" }
    const payer = setup.recipients.find((r) => r.key === setup.payment!.recipientKey)
    if (!payer || !isActionable(payer.role)) return { ok: false, error: "invalidPayer" }
    const ready = await prisma.payoutAccount.findMany({ where: { userId, ready: true }, select: { provider: true } })
    const provider = chooseProvider(setup.payment.currency, ready.map((r) => r.provider), setup.payment.provider)
    if (!provider) return { ok: false, error: "noPayoutAccount" }
    payment = { amount, currency: setup.payment.currency, provider, recipientKey: payer.key }
  }

  await prisma.$transaction(async (tx) => {
    await tx.field.deleteMany({ where: { documentId } })
    await tx.recipient.deleteMany({ where: { documentId } })

    const idByKey = new Map<string, string>()
    for (const r of setup.recipients) {
      const created = await tx.recipient.create({
        data: {
          documentId,
          name: r.name,
          email: r.email,
          phone: r.phone,
          role: r.role,
          order: setup.signingOrder === "SEQUENTIAL" ? r.order : 0,
          token: newSigningToken(),
          mustPay: payment?.recipientKey === r.key,
        },
      })
      idByKey.set(r.key, created.id)
    }

    if (setup.fields.length > 0) {
      await tx.field.createMany({
        data: setup.fields.map((f) => ({
          documentId,
          recipientId: idByKey.get(f.recipientKey)!,
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.type === "CHECKBOX" ? false : f.required,
          label: f.label,
        })),
      })
    }

    await tx.document.update({
      where: { id: documentId },
      data: {
        title: setup.title,
        signingOrder: setup.signingOrder,
        subject: setup.subject || null,
        message: setup.message || null,
        expiresInDays: setup.expiresInDays,
        paymentAmount: payment?.amount ?? null,
        paymentCurrency: payment?.currency ?? null,
        paymentProvider: payment?.provider ?? null,
      },
    })
  })
  return { ok: true }
}

// ─── Send ─────────────────────────────────────────────────────────────────────

type DocWithPeople = Prisma.DocumentGetPayload<{ include: { recipients: true; user: true } }>

/**
 * Emails signing links to whoever may act now, and says who was reached.
 *
 * `notified` are the recipients whose email the provider accepted;
 * `notEmailed` are those for whom nothing was sent because no provider is
 * configured, whose link must be shared by hand; `undelivered` are those a
 * configured provider refused. Only the first group is stamped: `sentAt` is
 * what the dashboard shows as "Sent", so it is written on provider success
 * and not before. It used to be written for every target whatever the
 * provider answered, and then for every target except refusals, which still
 * stamped "Sent" on a deployment that had no email at all.
 */
async function notifyNext(
  document: DocWithPeople,
  opts: { reminder?: boolean } = {}
): Promise<{ notified: string[]; notEmailed: string[]; undelivered: string[] }> {
  const targets = recipientsToNotify(document.recipients, document.signingOrder)
  const notified: string[] = []
  const notEmailed: string[] = []
  const undelivered: string[] = []
  const amountLabel =
    document.paymentAmount && document.paymentCurrency
      ? formatMinorUnits(document.paymentAmount, document.paymentCurrency)
      : null
  for (const r of targets) {
    const outcome = await sendSigningInvite({
      to: r.email,
      recipientName: r.name,
      senderName: document.user.name || document.user.email,
      title: document.title,
      message: document.message,
      url: signingUrl(appUrl(), r.token),
      expiresAt: r.expiresAt,
      reminder: opts.reminder,
      amountLabel: r.mustPay ? amountLabel : null,
    })
    // Replaced: notConfigured counted as notified, and was stamped "Sent".
    // ;(delivered(outcome) ? notified : undelivered).push(r.id)
    ;(outcome === "sent" ? notified : outcome === "notConfigured" ? notEmailed : undelivered).push(r.id)
  }
  // Previous version, which stamped every target regardless of the outcome:
  // if (targets.length > 0) {
  //   await prisma.recipient.updateMany({
  //     where: { id: { in: targets.map((r) => r.id) } },
  //     data: opts.reminder ? { lastReminderAt: new Date() } : { sentAt: new Date() },
  //   })
  // }
  // return targets.map((r) => r.id)
  if (notified.length > 0) {
    const now = new Date()
    if (opts.reminder) {
      await prisma.recipient.updateMany({ where: { id: { in: notified } }, data: { lastReminderAt: now } })
      // A reminder that gets through also settles an invite that did not.
      await prisma.recipient.updateMany({ where: { id: { in: notified }, sentAt: null }, data: { sentAt: now } })
    } else {
      await prisma.recipient.updateMany({ where: { id: { in: notified } }, data: { sentAt: now } })
    }
  }
  return { notified, notEmailed, undelivered }
}

/**
 * Sends a draft. `undelivered` is how many invitation emails the provider
 * refused: the document is sent either way (every link exists and can be
 * shared or resent from its page), but the caller must not tell the sender
 * that everyone was emailed when they were not.
 */
export async function sendDocument(userId: string, documentId: string): Promise<Result<{ undelivered: number; notEmailed: number }>> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId },
    include: { recipients: true, fields: true, user: true },
  })
  if (!document) return { ok: false, error: "notFound" }
  if (document.status !== "DRAFT") return { ok: false, error: "notDraft" }
  const actionable = document.recipients.filter((r) => isActionable(r.role))
  if (actionable.length === 0) return { ok: false, error: "noSigners" }
  // Every signer needs something to sign; approvers may simply approve.
  const unplaced = actionable.filter((r) => r.role === "SIGNER" && !document.fields.some((f) => f.recipientId === r.id))
  if (unplaced.length > 0) return { ok: false, error: "signerWithoutFields" }

  const now = new Date()
  // Confirmed sender, and under the daily abuse ceiling (sending-limits.ts).
  const blocked = await senderBlocker(userId, document.recipients.length, now)
  if (blocked) return { ok: false, error: blocked }
  // Asked again at the moment of sending: the plan may have changed since
  // the setup was saved (a downgrade, a lapsed trial), and the free monthly
  // allowance is spent by sending, not by saving.
  const plan = await senderPlan(userId, now)
  const gated = setupBlocker(plan.tier, {
    signingOrder: document.signingOrder,
    recipients: document.recipients,
    hasPayment: Boolean(document.paymentAmount),
  })
  if (gated) return { ok: false, error: planErrorCode(gated) }
  if (plan.documentsLeft === 0) return { ok: false, error: planErrorCode("unlimitedDocuments") }

  const expiresAt = computeExpiry(document.expiresInDays, now)
  const claimed = await prisma.document.updateMany({
    where: { id: documentId, status: "DRAFT" },
    data: { status: "PENDING", sentAt: now },
  })
  // Lost a race with a second click: the other request is sending it.
  if (claimed.count === 0) return { ok: false, error: "notDraft" }
  await prisma.recipient.updateMany({ where: { documentId }, data: { expiresAt, tokenIssuedAt: now } })
  await recordAudit(prisma, {
    documentId,
    type: AUDIT.SENT,
    actorEmail: document.user.email,
    data: { recipients: document.recipients.length },
    meta: await requestMeta(),
  })

  const fresh = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { recipients: true, user: true } })
  const { undelivered, notEmailed } = await notifyNext(fresh)
  return { ok: true, undelivered: undelivered.length, notEmailed: notEmailed.length }
}

// ─── Quick Send ───────────────────────────────────────────────────────────────

/**
 * Upload + recipients → sent, in one call. Fields are placed automatically
 * (a signature and a date per signer, see quick-send.ts).
 */
export async function quickSend(args: {
  userId: string
  title: string
  bytes: Uint8Array
  signers: { email: string; name?: string }[]
  message?: string
  expiresInDays: number | null
}): Promise<Result<{ documentId: string; undelivered: number; notEmailed: number }>> {
  // Asked before anything is stored, so a sender who may not send is told now
  // and is not left with a draft they never asked for. `sendDocument` asks
  // again at the moment of sending.
  const blocked = await senderBlocker(args.userId, args.signers.length)
  if (blocked) return { ok: false, error: blocked }
  // Same for a free account that has used its documents this month.
  if ((await senderPlan(args.userId)).documentsLeft === 0) return { ok: false, error: planErrorCode("unlimitedDocuments") }

  const created = await createDraftFromUpload({ userId: args.userId, title: args.title, bytes: args.bytes })
  if (!created.ok) return created
  const document = await prisma.document.update({
    where: { id: created.documentId },
    data: { quickSend: true, message: args.message || null, expiresInDays: args.expiresInDays },
  })

  const placed = autoPlaceFields(document.pageCount, args.signers.length)
  await prisma.$transaction(async (tx) => {
    const ids: string[] = []
    for (const s of args.signers) {
      const r = await tx.recipient.create({
        data: { documentId: document.id, email: s.email, name: s.name || nameFromEmail(s.email), token: newSigningToken() },
      })
      ids.push(r.id)
    }
    await tx.field.createMany({
      data: placed.map((f) => ({
        documentId: document.id,
        recipientId: ids[f.recipientIndex],
        type: f.type,
        page: f.page,
        x: f.x,
        y: f.y,
        width: f.width,
        height: f.height,
      })),
    })
  })

  const sent = await sendDocument(args.userId, document.id)
  if (!sent.ok) return sent
  return { ok: true, documentId: document.id, undelivered: sent.undelivered, notEmailed: sent.notEmailed }
}

// ─── Renew, remind, cancel ────────────────────────────────────────────────────

/**
 * One-click renewal: gives every unsigned recipient a fresh expiry, revives an
 * EXPIRED document to PENDING, and re-sends links to whoever may act now.
 * Tokens are kept, so links already sent (by email or WhatsApp) work again.
 */
export async function renewDocument(userId: string, documentId: string): Promise<Result<{ undelivered: number; notEmailed: number }>> {
  const document = await prisma.document.findFirst({ where: { id: documentId, userId }, include: { user: true } })
  if (!document) return { ok: false, error: "notFound" }
  if (!canRenewDocument(document.status)) return { ok: false, error: "notRenewable" }

  const now = new Date()
  // Renewing re-emails people already counted: confirmed sender, no ceiling.
  const blocked = await senderBlocker(userId, 0, now)
  if (blocked) return { ok: false, error: blocked }

  const expiresAt = computeExpiry(document.expiresInDays ?? DEFAULT_EXPIRY_DAYS, now)
  await prisma.$transaction([
    prisma.recipient.updateMany({ where: { documentId, signingStatus: "NOT_SIGNED" }, data: { expiresAt } }),
    prisma.document.update({ where: { id: documentId }, data: { status: "PENDING" } }),
  ])
  await recordAudit(prisma, {
    documentId,
    type: AUDIT.DOCUMENT_RENEWED,
    actorEmail: document.user.email,
    data: { expiresAt: expiresAt?.toISOString() ?? null },
    meta: await requestMeta(),
  })
  const fresh = await prisma.document.findUniqueOrThrow({ where: { id: documentId }, include: { recipients: true, user: true } })
  // The links are renewed whatever happens to the emails, so a refusal is
  // reported beside the success and not instead of it.
  const { undelivered, notEmailed } = await notifyNext(fresh)
  return { ok: true, undelivered: undelivered.length, notEmailed: notEmailed.length }
}

export async function remindDocument(userId: string, documentId: string): Promise<Result<{ undelivered: number }>> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId, status: "PENDING" },
    include: { recipients: true, user: true },
  })
  if (!document) return { ok: false, error: "notFound" }
  const blocked = await senderBlocker(userId, 0)
  if (blocked) return { ok: false, error: blocked }
  const { notified, notEmailed, undelivered } = await notifyNext(document, { reminder: true })
  // A reminder is nothing but its emails: if none got through, nothing
  // happened, and the audit trail must not say a reminder was sent.
  if (notified.length === 0 && undelivered.length > 0) return { ok: false, error: "emailFailed" }
  // Same with no provider at all: nothing went out, so nothing is recorded.
  if (notified.length === 0 && notEmailed.length > 0) return { ok: false, error: "emailNotConfigured" }
  await recordAudit(prisma, { documentId, type: AUDIT.REMINDER_SENT, actorEmail: document.user.email, data: { recipients: notified.length } })
  return { ok: true, undelivered: undelivered.length }
}

export async function cancelDocument(userId: string, documentId: string): Promise<Result> {
  const updated = await prisma.document.updateMany({
    where: { id: documentId, userId, status: { in: ["DRAFT", "PENDING", "EXPIRED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })
  if (updated.count === 0) return { ok: false, error: "notCancellable" }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  await recordAudit(prisma, { documentId, type: AUDIT.CANCELLED, actorEmail: user?.email, meta: await requestMeta() })
  // A signer may be on the checkout page right now: close it, or refund a
  // payment that landed in the meantime (payments/settle.ts).
  await closeOpenCheckouts(documentId)
  return { ok: true }
}

/**
 * Drafts are deleted outright, stored PDF included; anything sent is evidence
 * and is only cancelled.
 *
 * The row goes first and the file after it. The other order could leave a
 * draft pointing at a file that no longer exists; this one can at worst leave
 * a file with no row, which is logged, and swept when the account is deleted.
 */
export async function deleteDraft(userId: string, documentId: string): Promise<Result> {
  // Replaced: the row was deleted and its PDF left in storage for good, with
  // nothing pointing at it any more.
  // const deleted = await prisma.document.deleteMany({ where: { id: documentId, userId, status: "DRAFT" } })
  // return deleted.count > 0 ? { ok: true } : { ok: false, error: "notDraft" }
  const draft = await prisma.document.findFirst({
    where: { id: documentId, userId, status: "DRAFT" },
    select: { originalKey: true, sealedKey: true },
  })
  if (!draft) return { ok: false, error: "notDraft" }
  // Still conditional on DRAFT: a send that lands between the read and this
  // delete wins, and the file stays with the document it now belongs to.
  const deleted = await prisma.document.deleteMany({ where: { id: documentId, userId, status: "DRAFT" } })
  if (deleted.count === 0) return { ok: false, error: "notDraft" }
  await deleteStoredFiles([draft.originalKey, draft.sealedKey])
  return { ok: true }
}

/**
 * Removes every stored file of a user. Called once their account row is gone
 * (the documents go with it by cascade), and by folder rather than by row, so
 * a file whose row was lost to an earlier failure goes too. A storage failure
 * is logged and does not undo the deletion: the account is already gone.
 */
export async function deleteAccountFiles(userId: string): Promise<void> {
  try {
    await deleteFolder(userFolder(userId))
  } catch (error) {
    console.error(`[esign] could not delete stored files of deleted user ${userId}`, error)
  }
}

async function deleteStoredFiles(keys: (string | null)[]): Promise<void> {
  const results = await Promise.allSettled(keys.filter((k): k is string => Boolean(k)).map((key) => deleteFile(key)))
  for (const result of results) {
    if (result.status === "rejected") console.error("[esign] could not delete a stored file", result.reason)
  }
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

/**
 * Seals a finished document and emails everyone the signed copy.
 *
 * Atomic. The sealed PDF (certificate page included) is built and stored
 * first, under a key named by its own hash, and then a single transaction
 * commits everything that has to agree: the COMPLETED status, the COMPLETED
 * audit event, the sealed copy's key and its SHA-256. Either all of it is
 * written or none of it is, so:
 *
 * - two last signers finishing at the same moment both build a seal, but only
 *   one commit can claim the document; the other rolls back and deletes the
 *   file it uploaded. The stored file is always the one whose fingerprint is
 *   recorded, and the audit log has one COMPLETED event.
 * - the certificate prints the audit trail as of the commit: the transaction
 *   refuses if an event was added after the snapshot the seal was built from,
 *   and the seal is rebuilt (up to FINALIZE_ATTEMPTS times).
 * - a server failure anywhere before the commit leaves the document PENDING
 *   with every signer done, which `recoverStuckFinalizations` finds and
 *   finishes.
 *
 * Safe to call any number of times, from any number of places.
 */
export async function finalizeDocument(documentId: string): Promise<void> {
  for (let attempt = 1; attempt <= FINALIZE_ATTEMPTS; attempt++) {
    if ((await finalizeOnce(documentId)) !== "stale") return
  }
  // Still changing under us. Nothing was committed; the recovery sweep or
  // the next call picks it up.
  console.warn("[esign] finalize kept seeing new audit events; left for recovery", documentId)
}

const FINALIZE_ATTEMPTS = 3

/** Thrown inside the commit transaction to roll it back. */
class FinalizeConflict extends Error {
  constructor(readonly reason: "stale" | "taken") {
    super(`finalize ${reason}`)
  }
}

async function finalizeOnce(documentId: string): Promise<"done" | "nothing" | "taken" | "stale"> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: {
      user: true,
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      fields: { include: { signature: true } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  })
  const step = finalizeStep(document.status, document.sealedKey, document.recipients)
  if (!step) return "nothing"

  // The certificate page and the digital seal are a Business feature, judged
  // by the owner's plan when the document completes. Without it the copy is
  // still sealed in the sense that matters for the record (fields stamped,
  // forms flattened, hash stored); the audit trail stays on the dashboard and
  // in the export, it is just not printed into the PDF.
  const withCertificate = hasFeature(tierForEntitlement(await getEntitlement(document.userId)), "auditCertificate")

  // The COMPLETED event is printed on the certificate before it exists as a
  // row, so it is built here with the exact timestamp the row will get. Its
  // data records whether this copy carries the certificate, which is how the
  // document page and later emails know what the PDF contains.
  const completedAt = step === "SEAL_ONLY" ? document.completedAt ?? new Date() : new Date()
  const completedEvent = document.auditEvents.some((e) => e.type === AUDIT.COMPLETED)
    ? null
    : { type: AUDIT.COMPLETED, createdAt: completedAt, actorEmail: null, ipAddress: null }
  const audit = completedEvent ? [...document.auditEvents, completedEvent] : document.auditEvents
  const p12Base64 = withCertificate ? process.env.SIGNING_P12_BASE64 : undefined
  const sealed = await sealDocument({
    certificate: withCertificate,
    original: await getFile(document.originalKey),
    documentId: document.id,
    title: document.title,
    originalSha256: document.originalSha256,
    appName: siteConfig.name,
    completedAt,
    fields: document.fields,
    recipients: document.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.signingStatus,
      signedAt: r.signedAt,
    })),
    audit,
    p12: p12Base64
      ? { certificate: new Uint8Array(Buffer.from(p12Base64, "base64")), passphrase: process.env.SIGNING_P12_PASSPHRASE ?? "" }
      : null,
  })
  const sealedSha256 = sha256(sealed)
  const key = sealedDocumentKey(document.userId, document.originalKey.split("/")[2] ?? document.id, sealedSha256)
  await putFile(key, sealed)

  try {
    await prisma.$transaction(async (tx) => {
      // The audit log is append-only, so its length says whether anything
      // happened since the snapshot the certificate was printed from.
      const events = await tx.auditEvent.count({ where: { documentId } })
      if (events !== document.auditEvents.length) throw new FinalizeConflict("stale")
      const claimed = await tx.document.updateMany({
        where: { id: documentId, sealedKey: null, status: step === "SEAL_AND_COMPLETE" ? "PENDING" : "COMPLETED" },
        data: { status: "COMPLETED", completedAt, sealedKey: key, sealedSha256 },
      })
      if (claimed.count === 0) throw new FinalizeConflict("taken")
      if (completedEvent) {
        await tx.auditEvent.create({ data: { documentId, type: AUDIT.COMPLETED, createdAt: completedAt, data: { certificate: withCertificate } } })
      }
    })
  } catch (error) {
    await discardUnusedSeal(documentId, key)
    if (error instanceof FinalizeConflict) return error.reason
    throw error
  }

  // Only the run that committed gets here, so everyone is emailed once.
  const base = appUrl()
  await sendDocumentCompleted({
    to: document.user.email,
    name: document.user.name || document.user.email,
    title: document.title,
    downloadUrl: `${base}/dashboard/documents/${document.id}`,
    withCertificate,
  })
  for (const r of document.recipients) {
    await sendDocumentCompleted({
      to: r.email,
      name: r.name,
      title: document.title,
      downloadUrl: `${signingUrl(base, r.token)}/download`,
      withCertificate,
    })
  }
  return "done"
}

/**
 * Deletes a seal this run uploaded and did not commit. Identical bytes share
 * a key, so the file is kept if the document ended up recording that key
 * (another run committed the same seal).
 */
async function discardUnusedSeal(documentId: string, key: string): Promise<void> {
  try {
    const current = await prisma.document.findUnique({ where: { id: documentId }, select: { sealedKey: true } })
    if (current?.sealedKey !== key) await deleteFile(key)
  } catch (error) {
    console.error("[esign] could not discard an unused seal", key, error)
  }
}

// Replaced by the atomic finalizeDocument above. This version claimed the
// COMPLETED status first and sealed afterwards: the COMPLETED audit event was
// checked and then inserted, so two concurrent runs could each add one; both
// runs uploaded to the same fixed key, so the stored file could be the other
// run's while the fingerprint recorded was this one's; and a crash between
// the steps left a COMPLETED document with no sealed copy, or (before the
// status was claimed) a PENDING one that no sweep ever looked at.
// /**
//  * Seals a completed document and emails everyone the signed copy.
//  *
//  * Safe to call more than once: the COMPLETED transition is claimed atomically
//  * (two last signers finishing at the same moment cannot both win), and a
//  * document already sealed is left alone. If sealing throws, the document stays
//  * COMPLETED without a `sealedKey`, and the cron sweep calls this again.
//  */
// export async function finalizeDocument(documentId: string): Promise<void> {
//   await prisma.document.updateMany({
//     where: { id: documentId, status: "PENDING" },
//     data: { status: "COMPLETED", completedAt: new Date() },
//   })
//   const document = await prisma.document.findUniqueOrThrow({
//     where: { id: documentId },
//     include: {
//       user: true,
//       recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
//       fields: { include: { signature: true } },
//       auditEvents: { orderBy: { createdAt: "asc" } },
//     },
//   })
//   if (document.status !== "COMPLETED" || document.sealedKey) return
//
//   const hasCompletedEvent = document.auditEvents.some((e) => e.type === AUDIT.COMPLETED)
//   if (!hasCompletedEvent) {
//     const event = await prisma.auditEvent.create({ data: { documentId, type: AUDIT.COMPLETED } })
//     document.auditEvents.push(event)
//   }
//
//   const p12Base64 = process.env.SIGNING_P12_BASE64
//   const sealed = await sealDocument({
//     original: await getFile(document.originalKey),
//     documentId: document.id,
//     title: document.title,
//     originalSha256: document.originalSha256,
//     appName: siteConfig.name,
//     completedAt: document.completedAt ?? new Date(),
//     fields: document.fields,
//     recipients: document.recipients.map((r) => ({
//       name: r.name,
//       email: r.email,
//       role: r.role,
//       status: r.signingStatus,
//       signedAt: r.signedAt,
//     })),
//     audit: document.auditEvents,
//     p12: p12Base64
//       ? { certificate: new Uint8Array(Buffer.from(p12Base64, "base64")), passphrase: process.env.SIGNING_P12_PASSPHRASE ?? "" }
//       : null,
//   })
//
//   const key = documentKey(document.userId, document.originalKey.split("/")[2] ?? document.id, "sealed")
//   await putFile(key, sealed)
//   const claimed = await prisma.document.updateMany({
//     where: { id: documentId, sealedKey: null },
//     data: { sealedKey: key, sealedSha256: sha256(sealed) },
//   })
//   if (claimed.count === 0) return // another run sealed it first; skip duplicate emails
//
//   const base = appUrl()
//   await sendDocumentCompleted({
//     to: document.user.email,
//     name: document.user.name || document.user.email,
//     title: document.title,
//     downloadUrl: `${base}/dashboard/documents/${document.id}`,
//   })
//   for (const r of document.recipients) {
//     await sendDocumentCompleted({
//       to: r.email,
//       name: r.name,
//       title: document.title,
//       downloadUrl: `${signingUrl(base, r.token)}/download`,
//     })
//   }
// }

// ─── Sweeps (called by the cron route) ────────────────────────────────────────

/** Marks lapsed documents EXPIRED and tells their owners, once. */
export async function expireSweep(now = new Date()): Promise<number> {
  const candidates = await prisma.document.findMany({
    where: { status: "PENDING", recipients: { some: { signingStatus: "NOT_SIGNED", expiresAt: { lte: now } } } },
    include: { recipients: true, user: true },
    take: 200,
  })
  let expired = 0
  for (const document of candidates) {
    if (!shouldExpireDocument(document, document.recipients, now)) continue
    const updated = await prisma.document.updateMany({ where: { id: document.id, status: "PENDING" }, data: { status: "EXPIRED" } })
    if (updated.count === 0) continue
    expired++
    await recordAudit(prisma, { documentId: document.id, type: AUDIT.EXPIRED })
    // Same as a cancellation: no checkout stays open on a closed document.
    await closeOpenCheckouts(document.id)
    await sendDocumentExpired({
      to: document.user.email,
      ownerName: document.user.name || document.user.email,
      title: document.title,
      url: `${appUrl()}/dashboard/documents/${document.id}`,
    })
  }
  return expired
}

/** Automatic reminders: every 3 days to recipients who have not signed yet. */
export async function reminderSweep(now = new Date()): Promise<number> {
  const threshold = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
  const documents = await prisma.document.findMany({
    where: {
      status: "PENDING",
      sentAt: { lte: threshold },
      recipients: {
        some: {
          signingStatus: "NOT_SIGNED",
          OR: [{ lastReminderAt: null }, { lastReminderAt: { lte: threshold } }],
        },
      },
    },
    include: { recipients: true, user: true },
    take: 200,
  })
  let sent = 0
  for (const document of documents) {
    // Only nudge recipients whose own last touch is old enough.
    const due = {
      ...document,
      recipients: document.recipients.map((r) =>
        r.lastReminderAt && r.lastReminderAt > threshold ? { ...r, signingStatus: "SIGNED" as const } : r
      ),
    }
    const { notified: ids } = await notifyNext(due, { reminder: true })
    if (ids.length > 0) {
      sent += ids.length
      await recordAudit(prisma, { documentId: document.id, type: AUDIT.REMINDER_SENT, data: { recipients: ids.length, automatic: true } })
    }
  }
  return sent
}

/**
 * Finishes documents whose finalization did not: every signer is done but no
 * sealed copy was committed (a server failure mid-finalization, a timeout, a
 * storage error), plus any document the earlier two-step version left
 * COMPLETED without a copy. Only documents past `FINALIZE_GRACE_MS` are
 * touched, so a finalization still running in a request is left alone.
 * Returns how many documents were finished.
 */
export async function recoverStuckFinalizations(now = new Date()): Promise<number> {
  const candidates = await prisma.document.findMany({
    where: {
      sealedKey: null,
      OR: [
        { status: "COMPLETED" },
        // Pending with no signer or approver left to sign: the cheap filter;
        // `isStuckFinalization` makes the real decision.
        {
          status: "PENDING",
          recipients: {
            some: { role: { in: ["SIGNER", "APPROVER"] } },
            none: { role: { in: ["SIGNER", "APPROVER"] }, signingStatus: { not: "SIGNED" } },
          },
        },
      ],
    },
    include: { recipients: true },
    take: 20,
  })
  let finished = 0
  for (const document of candidates) {
    if (!isStuckFinalization(document, document.recipients, now)) continue
    try {
      await finalizeDocument(document.id)
      const after = await prisma.document.findUnique({ where: { id: document.id }, select: { sealedKey: true } })
      if (after?.sealedKey) finished++
    } catch (error) {
      console.error("[esign] recovery of a stuck finalization failed", document.id, error)
    }
  }
  return finished
}

/**
 * Finishes one document if it is stuck, for pages that show it. Cheap when it
 * is not: one decision on rows the caller already loaded.
 */
export async function recoverIfStuck(
  document: { id: string; status: DocumentStatus; sealedKey: string | null; completedAt: Date | null },
  recipients: (RuleRecipient & { signedAt: Date | null })[],
  now = new Date()
): Promise<void> {
  if (!isStuckFinalization(document, recipients, now)) return
  try {
    await finalizeDocument(document.id)
  } catch (error) {
    console.error("[esign] recovery of a stuck finalization failed", document.id, error)
  }
}

// Replaced by recoverStuckFinalizations, which also finds documents left
// PENDING with every signer done (the state a failure mid-finalization now
// leaves), and waits out the grace period instead of racing a live attempt.
// /** Re-runs sealing for documents that completed but failed to seal. */
// export async function resealSweep(): Promise<number> {
//   const stuck = await prisma.document.findMany({ where: { status: "COMPLETED", sealedKey: null }, select: { id: true }, take: 20 })
//   for (const { id } of stuck) {
//     try {
//       await finalizeDocument(id)
//     } catch (error) {
//       console.error("[esign] reseal failed", id, error)
//     }
//   }
//   return stuck.length
// }
