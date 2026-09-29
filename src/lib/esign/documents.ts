/**
 * Sender-side document lifecycle: upload → set up → send → (renew | cancel)
 * → finalize, plus Quick Send and the scheduled sweeps.
 *
 * Every function takes the acting user's id and checks ownership itself;
 * server actions are thin wrappers that parse input and translate errors.
 * Functions return `{ ok: false, error }` codes for expected failures (the
 * action maps them to translated messages) and throw only on the unexpected.
 *
 * Note on sending limits: there are none. Nothing in this file counts
 * documents or consults the plan. That is a product decision (no envelope
 * caps), not an omission. Abuse protection is the rate limiter in the actions.
 */
import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { AUDIT, recordAudit, requestMeta } from "./audit"
import { documentKey, getFile, putFile, sha256 } from "./storage"
import { inspectPdf, type PdfInspection } from "./pdf/inspect"
import { sealDocument } from "./pdf/seal"
import { newSigningToken } from "./tokens"
import {
  canRenewDocument,
  computeExpiry,
  isActionable,
  recipientsToNotify,
  shouldExpireDocument,
} from "./rules"
import { autoPlaceFields } from "./quick-send"
import { chooseProvider, formatMinorUnits, toMinorUnits } from "./payments/select"
import { nameFromEmail, type DocumentSetup } from "./schemas"
import { signingUrl } from "./share"
import { sendDocumentCompleted, sendDocumentExpired, sendSigningInvite } from "./emails"

export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

export const appUrl = () => siteConfig.url

/** Fallback when a document was created without an explicit expiry setting. */
const DEFAULT_RENEW_DAYS = 30

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

  const keys = new Set(setup.recipients.map((r) => r.key))
  if (keys.size !== setup.recipients.length) return { ok: false, error: "invalidInput" }
  // Quick Send may reference one appended page; the editor may not.
  if (setup.fields.some((f) => !keys.has(f.recipientKey) || f.page > document.pageCount)) {
    return { ok: false, error: "invalidInput" }
  }

  let payment: { amount: number; currency: string; provider: "STRIPE" | "PAYSTACK"; recipientKey: string } | null = null
  if (setup.payment) {
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

/** Emails signing links to whoever may act now. Returns the recipients emailed. */
async function notifyNext(document: DocWithPeople, opts: { reminder?: boolean } = {}): Promise<string[]> {
  const targets = recipientsToNotify(document.recipients, document.signingOrder)
  const amountLabel =
    document.paymentAmount && document.paymentCurrency
      ? formatMinorUnits(document.paymentAmount, document.paymentCurrency)
      : null
  for (const r of targets) {
    await sendSigningInvite({
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
  }
  if (targets.length > 0) {
    await prisma.recipient.updateMany({
      where: { id: { in: targets.map((r) => r.id) } },
      data: opts.reminder ? { lastReminderAt: new Date() } : { sentAt: new Date() },
    })
  }
  return targets.map((r) => r.id)
}

export async function sendDocument(userId: string, documentId: string): Promise<Result> {
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
  await notifyNext(fresh)
  return { ok: true }
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
}): Promise<Result<{ documentId: string }>> {
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
  return { ok: true, documentId: document.id }
}

// ─── Renew, remind, cancel ────────────────────────────────────────────────────

/**
 * One-click renewal: gives every unsigned recipient a fresh expiry, revives an
 * EXPIRED document to PENDING, and re-sends links to whoever may act now.
 * Tokens are kept, so links already sent (by email or WhatsApp) work again.
 */
export async function renewDocument(userId: string, documentId: string): Promise<Result> {
  const document = await prisma.document.findFirst({ where: { id: documentId, userId }, include: { user: true } })
  if (!document) return { ok: false, error: "notFound" }
  if (!canRenewDocument(document.status)) return { ok: false, error: "notRenewable" }

  const now = new Date()
  const expiresAt = computeExpiry(document.expiresInDays ?? DEFAULT_RENEW_DAYS, now)
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
  await notifyNext(fresh)
  return { ok: true }
}

export async function remindDocument(userId: string, documentId: string): Promise<Result> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, userId, status: "PENDING" },
    include: { recipients: true, user: true },
  })
  if (!document) return { ok: false, error: "notFound" }
  const ids = await notifyNext(document, { reminder: true })
  await recordAudit(prisma, { documentId, type: AUDIT.REMINDER_SENT, actorEmail: document.user.email, data: { recipients: ids.length } })
  return { ok: true }
}

export async function cancelDocument(userId: string, documentId: string): Promise<Result> {
  const updated = await prisma.document.updateMany({
    where: { id: documentId, userId, status: { in: ["DRAFT", "PENDING", "EXPIRED"] } },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  })
  if (updated.count === 0) return { ok: false, error: "notCancellable" }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  await recordAudit(prisma, { documentId, type: AUDIT.CANCELLED, actorEmail: user?.email, meta: await requestMeta() })
  return { ok: true }
}

/** Drafts are deleted outright; anything sent is evidence and is only cancelled. */
export async function deleteDraft(userId: string, documentId: string): Promise<Result> {
  const deleted = await prisma.document.deleteMany({ where: { id: documentId, userId, status: "DRAFT" } })
  return deleted.count > 0 ? { ok: true } : { ok: false, error: "notDraft" }
}

// ─── Finalize ─────────────────────────────────────────────────────────────────

/**
 * Seals a completed document and emails everyone the signed copy.
 *
 * Safe to call more than once: the COMPLETED transition is claimed atomically
 * (two last signers finishing at the same moment cannot both win), and a
 * document already sealed is left alone. If sealing throws, the document stays
 * COMPLETED without a `sealedKey`, and the cron sweep calls this again.
 */
export async function finalizeDocument(documentId: string): Promise<void> {
  await prisma.document.updateMany({
    where: { id: documentId, status: "PENDING" },
    data: { status: "COMPLETED", completedAt: new Date() },
  })
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: {
      user: true,
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      fields: { include: { signature: true } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
  })
  if (document.status !== "COMPLETED" || document.sealedKey) return

  const hasCompletedEvent = document.auditEvents.some((e) => e.type === AUDIT.COMPLETED)
  if (!hasCompletedEvent) {
    const event = await prisma.auditEvent.create({ data: { documentId, type: AUDIT.COMPLETED } })
    document.auditEvents.push(event)
  }

  const p12Base64 = process.env.SIGNING_P12_BASE64
  const sealed = await sealDocument({
    original: await getFile(document.originalKey),
    documentId: document.id,
    title: document.title,
    originalSha256: document.originalSha256,
    appName: siteConfig.name,
    completedAt: document.completedAt ?? new Date(),
    fields: document.fields,
    recipients: document.recipients.map((r) => ({
      name: r.name,
      email: r.email,
      role: r.role,
      status: r.signingStatus,
      signedAt: r.signedAt,
    })),
    audit: document.auditEvents,
    p12: p12Base64
      ? { certificate: new Uint8Array(Buffer.from(p12Base64, "base64")), passphrase: process.env.SIGNING_P12_PASSPHRASE ?? "" }
      : null,
  })

  const key = documentKey(document.userId, document.originalKey.split("/")[2] ?? document.id, "sealed")
  await putFile(key, sealed)
  const claimed = await prisma.document.updateMany({
    where: { id: documentId, sealedKey: null },
    data: { sealedKey: key, sealedSha256: sha256(sealed) },
  })
  if (claimed.count === 0) return // another run sealed it first; skip duplicate emails

  const base = appUrl()
  await sendDocumentCompleted({
    to: document.user.email,
    name: document.user.name || document.user.email,
    title: document.title,
    downloadUrl: `${base}/dashboard/documents/${document.id}`,
  })
  for (const r of document.recipients) {
    await sendDocumentCompleted({
      to: r.email,
      name: r.name,
      title: document.title,
      downloadUrl: `${signingUrl(base, r.token)}/download`,
    })
  }
}

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
    const ids = await notifyNext(due, { reminder: true })
    if (ids.length > 0) {
      sent += ids.length
      await recordAudit(prisma, { documentId: document.id, type: AUDIT.REMINDER_SENT, data: { recipients: ids.length, automatic: true } })
    }
  }
  return sent
}

/** Re-runs sealing for documents that completed but failed to seal. */
export async function resealSweep(): Promise<number> {
  const stuck = await prisma.document.findMany({ where: { status: "COMPLETED", sealedKey: null }, select: { id: true }, take: 20 })
  for (const { id } of stuck) {
    try {
      await finalizeDocument(id)
    } catch (error) {
      console.error("[esign] reseal failed", id, error)
    }
  }
  return stuck.length
}
