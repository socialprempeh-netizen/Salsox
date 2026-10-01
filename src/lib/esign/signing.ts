/**
 * Signer-side operations, authorised by the signing token alone (signers have
 * no account). Each operation reloads the recipient and re-checks the rules in
 * `rules.ts`, so an expired, rotated or out-of-turn token can do nothing even
 * if the page it came from is still open.
 *
 * Flow: view → fill each field (saved one by one, so a phone that drops off
 * the network loses nothing) → pay, if Sign & Pay → complete (or reject).
 */
import type { FieldType } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { AUDIT, recordAudit, requestMeta } from "./audit"
import {
  canViewOriginal,
  isDocumentComplete,
  missingRequiredFields,
  paymentOutstanding,
  recipientsToNotify,
  signingBlocker,
  type SigningBlocker,
} from "./rules"
import { isPlausibleToken } from "./tokens"
import { finalizeDocument, appUrl, type Result } from "./documents"
import { delivered, sendDocumentRejected, sendSigningInvite } from "./emails"
import { signingUrl } from "./share"
import { getProvider } from "./payments"
import { formatMinorUnits, isSignAndPayCurrency } from "./payments/select"
import { checkSignatureImage } from "./pdf/signature-image"

/** Drawn signatures are small PNGs; anything larger is not a signature. */
const MAX_SIGNATURE_DATA_URL = 400_000
const MAX_TEXT = 500

async function loadByToken(token: string) {
  if (!isPlausibleToken(token)) return null
  return prisma.recipient.findUnique({
    where: { token },
    include: {
      document: { include: { user: { select: { name: true, email: true } }, recipients: true } },
      payments: true,
    },
  })
}

export type SigningContext = NonNullable<Awaited<ReturnType<typeof getSigningContext>>>

/** Everything the signing page needs, or null for an unknown token. */
export async function getSigningContext(token: string) {
  const recipient = await loadByToken(token)
  if (!recipient) return null
  const fields = await prisma.field.findMany({
    where: { recipientId: recipient.id },
    include: { signature: true },
    orderBy: [{ page: "asc" }, { y: "asc" }, { x: "asc" }],
  })
  const { document } = recipient
  const now = new Date()
  const blocker = signingBlocker(document, recipient, document.recipients, now)
  const paid = recipient.payments.some((p) => p.status === "PAID")
  return {
    recipient,
    document,
    fields,
    blocker,
    paid,
    paymentDue: paymentOutstanding(document, recipient, paid),
    // Whether /sign/{token}/file will serve the PDF, so the page never offers
    // a link that answers 404.
    canViewFile: canViewOriginal(document.status, recipient, now),
    // Fields may sit on a page appended by Quick Send.
    renderedPageCount: Math.max(document.pageCount, ...fields.map((f) => f.page)),
  }
}

/** Records the first open of the link (audit evidence that the signer saw it). */
export async function markViewed(token: string): Promise<void> {
  const recipient = await loadByToken(token)
  if (!recipient || recipient.viewedAt) return
  const updated = await prisma.recipient.updateMany({ where: { id: recipient.id, viewedAt: null }, data: { viewedAt: new Date() } })
  if (updated.count === 0) return
  await recordAudit(prisma, {
    documentId: recipient.documentId,
    recipientId: recipient.id,
    type: AUDIT.VIEWED,
    actorEmail: recipient.email,
    meta: await requestMeta(),
  })
}

async function actionable(token: string): Promise<{ ok: true; recipient: NonNullable<Awaited<ReturnType<typeof loadByToken>>> } | { ok: false; error: SigningBlocker | "notFound" }> {
  const recipient = await loadByToken(token)
  if (!recipient) return { ok: false, error: "notFound" }
  const blocker = signingBlocker(recipient.document, recipient, recipient.document.recipients, new Date())
  if (blocker) return { ok: false, error: blocker }
  return { ok: true, recipient }
}

export type FieldInputValue = { value?: string | null; imageDataUrl?: string | null; typedText?: string | null }

/** Validates one field's value for its type. Returns the normalised value or null if invalid. */
export function normaliseFieldValue(type: FieldType, input: FieldInputValue): FieldInputValue | null {
  switch (type) {
    case "SIGNATURE":
    case "INITIALS": {
      const image = input.imageDataUrl?.trim()
      if (image) {
        if (!/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > MAX_SIGNATURE_DATA_URL) return null
        return { imageDataUrl: image }
      }
      const typed = input.typedText?.trim()
      if (typed && typed.length <= 80) return { typedText: typed }
      return null
    }
    case "CHECKBOX":
      return input.value === "true" || input.value === "false" ? { value: input.value } : null
    case "DATE": {
      const value = input.value?.trim()
      return value && value.length <= 40 ? { value } : null
    }
    case "EMAIL": {
      const value = input.value?.trim()
      return value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200 ? { value } : null
    }
    default: {
      const value = input.value?.trim()
      return value && value.length <= MAX_TEXT ? { value } : null
    }
  }
}

export async function saveField(token: string, fieldId: string, input: FieldInputValue): Promise<Result> {
  const check = await actionable(token)
  if (!check.ok) return check
  const { recipient } = check
  const field = await prisma.field.findFirst({ where: { id: fieldId, recipientId: recipient.id } })
  if (!field) return { ok: false, error: "notFound" }
  const value = normaliseFieldValue(field.type, input)
  if (!value) return { ok: false, error: "invalidValue" }
  // A drawn or uploaded signature must be an image the sealer can stamp.
  // `normaliseFieldValue` only checks the data URL's shape; bytes that were
  // not an image used to be stored here and then failed every attempt to seal
  // the finished document. Refused now, while the signer can still redraw.
  if (value.imageDataUrl) {
    const image = await checkSignatureImage(value.imageDataUrl)
    if (!image.ok) return { ok: false, error: "invalidSignature" }
  }

  await prisma.$transaction(async (tx) => {
    if (field.type === "SIGNATURE" || field.type === "INITIALS") {
      await tx.signature.upsert({
        where: { fieldId },
        create: { fieldId, recipientId: recipient.id, imageDataUrl: value.imageDataUrl ?? null, typedText: value.typedText ?? null },
        update: { imageDataUrl: value.imageDataUrl ?? null, typedText: value.typedText ?? null },
      })
      await tx.field.update({ where: { id: fieldId }, data: { inserted: true } })
    } else {
      await tx.field.update({ where: { id: fieldId }, data: { value: value.value, inserted: true } })
    }
    await recordAudit(tx, {
      documentId: recipient.documentId,
      recipientId: recipient.id,
      type: AUDIT.FIELD_SIGNED,
      actorEmail: recipient.email,
      data: { fieldId, fieldType: field.type },
      meta: await requestMeta(),
    })
  })
  return { ok: true }
}

/**
 * Finishes this recipient's part. Refuses while required fields are empty or
 * a Sign & Pay payment is outstanding. When the last signer finishes, the
 * document is sealed; in a sequential document the next group is emailed.
 */
export async function completeSigning(token: string): Promise<Result<{ documentCompleted: boolean }>> {
  const check = await actionable(token)
  if (!check.ok) return check
  const { recipient } = check
  const fields = await prisma.field.findMany({ where: { recipientId: recipient.id } })
  if (missingRequiredFields(fields, recipient.id).length > 0) return { ok: false, error: "missingFields" }
  const paid = recipient.payments.some((p) => p.status === "PAID")
  if (paymentOutstanding(recipient.document, recipient, paid)) return { ok: false, error: "paymentRequired" }

  // Guarded transition: a double tap cannot sign twice.
  const updated = await prisma.recipient.updateMany({
    where: { id: recipient.id, signingStatus: "NOT_SIGNED" },
    data: { signingStatus: "SIGNED", signedAt: new Date() },
  })
  if (updated.count === 0) return { ok: false, error: "ALREADY_SIGNED" }
  await recordAudit(prisma, {
    documentId: recipient.documentId,
    recipientId: recipient.id,
    type: AUDIT.RECIPIENT_SIGNED,
    actorEmail: recipient.email,
    meta: await requestMeta(),
  })

  const document = await prisma.document.findUniqueOrThrow({
    where: { id: recipient.documentId },
    include: { recipients: true, user: true },
  })
  if (isDocumentComplete(document.recipients)) {
    try {
      await finalizeDocument(document.id)
    } catch (error) {
      // The signature is recorded; sealing is retried by the cron sweep.
      console.error("[esign] finalize failed, will retry", document.id, error)
    }
    return { ok: true, documentCompleted: true }
  }

  if (document.signingOrder === "SEQUENTIAL") {
    // Email the next group, but only those not already emailed.
    for (const next of recipientsToNotify(document.recipients, "SEQUENTIAL").filter((r) => !r.sentAt)) {
      const outcome = await sendSigningInvite({
        to: next.email,
        recipientName: next.name,
        senderName: document.user.name || document.user.email,
        title: document.title,
        message: document.message,
        url: signingUrl(appUrl(), next.token),
        expiresAt: next.expiresAt,
        amountLabel:
          next.mustPay && document.paymentAmount && document.paymentCurrency
            ? formatMinorUnits(document.paymentAmount, document.paymentCurrency)
            : null,
      })
      // Stamped only when the email went: an unstamped recipient whose turn
      // it is shows on the sender's document page as "not delivered", with a
      // Resend button. It used to be stamped whatever the provider answered.
      // await prisma.recipient.update({ where: { id: next.id }, data: { sentAt: new Date() } })
      if (delivered(outcome)) await prisma.recipient.update({ where: { id: next.id }, data: { sentAt: new Date() } })
    }
  }
  return { ok: true, documentCompleted: false }
}

export async function rejectSigning(token: string, reason: string): Promise<Result> {
  const check = await actionable(token)
  if (!check.ok) return check
  const { recipient } = check
  const trimmed = reason.trim().slice(0, 500)
  const updated = await prisma.recipient.updateMany({
    where: { id: recipient.id, signingStatus: "NOT_SIGNED" },
    data: { signingStatus: "REJECTED", rejectionReason: trimmed || null },
  })
  if (updated.count === 0) return { ok: false, error: "ALREADY_SIGNED" }
  await prisma.document.updateMany({ where: { id: recipient.documentId, status: "PENDING" }, data: { status: "REJECTED" } })
  await recordAudit(prisma, {
    documentId: recipient.documentId,
    recipientId: recipient.id,
    type: AUDIT.RECIPIENT_REJECTED,
    actorEmail: recipient.email,
    data: { reason: trimmed || null },
    meta: await requestMeta(),
  })
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: recipient.document.userId } })
  await sendDocumentRejected({
    to: owner.email,
    ownerName: owner.name || owner.email,
    signerName: recipient.name,
    title: recipient.document.title,
    reason: trimmed,
    url: `${appUrl()}/dashboard/documents/${recipient.documentId}`,
  })
  return { ok: true }
}

// ─── Sign & Pay ───────────────────────────────────────────────────────────────

/** Opens a checkout for this recipient's payment and returns where to send them. */
export async function startPayment(token: string): Promise<Result<{ url: string }>> {
  const check = await actionable(token)
  if (!check.ok) return check
  const { recipient } = check
  const { document } = recipient
  if (!paymentOutstanding(document, recipient, recipient.payments.some((p) => p.status === "PAID"))) {
    return { ok: false, error: "noPaymentDue" }
  }
  if (!document.paymentProvider || !document.paymentAmount || !document.paymentCurrency) return { ok: false, error: "noPaymentDue" }
  // A document saved before currencies were restricted may hold any code. The
  // amount means hundredths only in these currencies, so nothing is charged
  // in any other.
  if (!isSignAndPayCurrency(document.paymentCurrency)) return { ok: false, error: "payoutUnavailable" }
  const payout = await prisma.payoutAccount.findUnique({
    where: { userId_provider: { userId: document.userId, provider: document.paymentProvider } },
  })
  if (!payout?.ready) return { ok: false, error: "payoutUnavailable" }

  const provider = getProvider(document.paymentProvider)
  if (!provider.isConfigured()) return { ok: false, error: "payoutUnavailable" }

  const base = signingUrl(appUrl(), token)
  const reference = `sx_${recipient.id}_${Date.now()}`
  const payment = await prisma.payment.create({
    data: {
      documentId: document.id,
      recipientId: recipient.id,
      provider: document.paymentProvider,
      providerRef: reference,
      amount: document.paymentAmount,
      currency: document.paymentCurrency,
    },
  })
  const session = await provider.createCheckout({
    paymentId: payment.id,
    documentId: document.id,
    description: document.title,
    amount: document.paymentAmount,
    currency: document.paymentCurrency,
    payerEmail: recipient.email,
    payoutAccountId: payout.externalAccountId,
    reference,
    successUrl: `${base}?payment=${payment.id}`,
    cancelUrl: base,
  })
  // Stripe issues its own session id; store it so the webhook can find the row.
  if (session.providerRef !== reference) {
    await prisma.payment.update({ where: { id: payment.id }, data: { providerRef: session.providerRef } })
  }
  await recordAudit(prisma, {
    documentId: document.id,
    recipientId: recipient.id,
    type: AUDIT.PAYMENT_STARTED,
    actorEmail: recipient.email,
    data: { provider: document.paymentProvider, amount: document.paymentAmount, currency: document.paymentCurrency },
    meta: await requestMeta(),
  })
  return { ok: true, url: session.url }
}

/**
 * Confirms a payment with the provider itself (never trusting the webhook body
 * or the return URL alone) and, if every required field is already filled,
 * completes the signature in the same step: that is the "one flow" in
 * Sign & Pay. Idempotent; webhooks and the return page may both call it.
 */
export async function confirmPayment(paymentId: string): Promise<"PAID" | "PENDING" | "FAILED" | "UNKNOWN"> {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { recipient: true } })
  if (!payment) return "UNKNOWN"
  if (payment.status === "PAID") return "PAID"

  const verified = await getProvider(payment.provider).verify(payment.providerRef)
  // Amount and currency must match what we asked for, or it is not our payment.
  const matches =
    (verified.amount === undefined || verified.amount === payment.amount) &&
    (verified.currency === undefined || verified.currency === payment.currency)
  if (verified.status === "FAILED" || (verified.status === "PAID" && !matches)) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } })
    return "FAILED"
  }
  if (verified.status !== "PAID") return "PENDING"

  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: { not: "PAID" } },
    data: { status: "PAID", paidAt: new Date() },
  })
  if (updated.count > 0) {
    await recordAudit(prisma, {
      documentId: payment.documentId,
      recipientId: payment.recipientId,
      type: AUDIT.PAYMENT_RECEIVED,
      actorEmail: payment.recipient.email,
      data: { provider: payment.provider, amount: payment.amount, currency: payment.currency, ref: payment.providerRef },
    })
    // Complete automatically when nothing else is left to do.
    const result = await completeSigning(payment.recipient.token)
    if (!result.ok && result.error !== "missingFields") {
      console.warn("[esign] payment confirmed but completion deferred", payment.id, result.error)
    }
  }
  return "PAID"
}

/** Finds our payment by provider reference (for webhooks). */
export async function paymentIdByRef(providerRef: string): Promise<string | null> {
  const payment = await prisma.payment.findUnique({ where: { providerRef }, select: { id: true } })
  return payment?.id ?? null
}
