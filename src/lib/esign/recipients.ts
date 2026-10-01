/**
 * Fixing a recipient without rebuilding the document.
 *
 * The complaint this answers: with DocuSign-style tools, a typo in an email
 * address or an expired envelope often means voiding and recreating the whole
 * thing, fields and all. Here a recipient's fields, and everyone else's
 * signatures, hang off the recipient row, so correcting the address is an
 * update of that row:
 *
 *   - the token is ROTATED, so the link that went to the wrong address dies;
 *   - the expiry restarts, and an EXPIRED document comes back to PENDING;
 *   - the new address gets a fresh link immediately (if it is their turn);
 *   - an audit event records the old and new address.
 */
import { prisma } from "@/lib/prisma"
import { AUDIT, recordAudit, requestMeta } from "./audit"
import { canEditRecipient, computeExpiry, isRecipientTurn } from "./rules"
import { newSigningToken } from "./tokens"
import { delivered, emailed, sendSigningInvite } from "./emails"
import { signingUrl } from "./share"
import { appUrl, renewDocument, type Result } from "./documents"
import { formatMinorUnits } from "./payments/select"
import { senderBlocker } from "./sender"
import { DEFAULT_EXPIRY_DAYS } from "./limits"

// Replaced by DEFAULT_EXPIRY_DAYS in ./limits: this 30 was declared in both
// documents.ts and recipients.ts, and is also the default a new document gets.
// const DEFAULT_RENEW_DAYS = 30

export async function updateRecipient(
  userId: string,
  recipientId: string,
  input: { name: string; email: string; phone?: string }
): Promise<Result<{ tokenRotated: boolean; emailFailed: boolean; notEmailed: boolean }>> {
  const recipient = await prisma.recipient.findFirst({
    where: { id: recipientId, document: { userId } },
    include: { document: { include: { user: true, recipients: true } } },
  })
  if (!recipient) return { ok: false, error: "notFound" }
  const { document } = recipient
  if (!canEditRecipient(document.status, recipient)) return { ok: false, error: "notEditable" }
  // A changed address gets a fresh invite, so this is a path that emails an
  // address the sender typed: it needs a confirmed sender like any other.
  const blocked = await senderBlocker(userId, 0)
  if (blocked) return { ok: false, error: blocked }

  const emailChanged = recipient.email !== input.email
  const now = new Date()
  const updated = await prisma.recipient.update({
    where: { id: recipientId },
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      // Rotation is what revokes the link sent to the wrong address.
      ...(emailChanged
        ? {
            token: newSigningToken(),
            tokenIssuedAt: now,
            viewedAt: null,
            expiresAt: computeExpiry(document.expiresInDays ?? DEFAULT_EXPIRY_DAYS, now),
          }
        : {}),
    },
  })

  await recordAudit(prisma, {
    documentId: document.id,
    recipientId,
    type: AUDIT.RECIPIENT_UPDATED,
    actorEmail: document.user.email,
    data: { from: recipient.email, to: input.email, tokenRotated: emailChanged },
    meta: await requestMeta(),
  })

  // An expired document is revived as a whole: the other unsigned recipients'
  // links are extended too, otherwise the sweep would expire it again at once.
  if (document.status === "EXPIRED") {
    const renewed = await renewDocument(userId, document.id)
    if (!renewed.ok) return renewed
    return { ok: true, tokenRotated: emailChanged, emailFailed: renewed.undelivered > 0, notEmailed: renewed.notEmailed > 0 }
  }

  const all = document.recipients.map((r) => (r.id === updated.id ? updated : r))
  // The correction itself always stands (the old link is dead either way);
  // what can fail is the email carrying the new link, and the sender is told.
  let emailFailed = false
  // No provider configured: nothing was sent, and the sender must share the
  // new link by hand. Neither a failure to retry nor a "Sent".
  let notEmailed = false
  if (emailChanged && document.status === "PENDING" && isRecipientTurn(updated, all, document.signingOrder)) {
    const outcome = await sendSigningInvite({
      to: updated.email,
      recipientName: updated.name,
      senderName: document.user.name || document.user.email,
      title: document.title,
      message: document.message,
      url: signingUrl(appUrl(), updated.token),
      expiresAt: updated.expiresAt,
      amountLabel:
        updated.mustPay && document.paymentAmount && document.paymentCurrency
          ? formatMinorUnits(document.paymentAmount, document.paymentCurrency)
          : null,
    })
    // `sentAt` is what shows as "Sent": cleared when the email did not go, so
    // the corrected recipient is not shown as emailed at an address that
    // never got anything.
    // await prisma.recipient.update({ where: { id: updated.id }, data: { sentAt: now } })
    emailFailed = !delivered(outcome)
    notEmailed = outcome === "notConfigured"
    // Then written for "not configured" too, which showed "Sent" with no email:
    // await prisma.recipient.update({ where: { id: updated.id }, data: { sentAt: emailFailed ? null : now } })
    await prisma.recipient.update({ where: { id: updated.id }, data: { sentAt: emailed(outcome) ? now : null } })
  }
  return { ok: true, tokenRotated: emailChanged, emailFailed, notEmailed }
}

/** Re-sends one recipient's current link (same token), e.g. "I can't find the email". */
export async function resendToRecipient(userId: string, recipientId: string): Promise<Result> {
  const recipient = await prisma.recipient.findFirst({
    where: { id: recipientId, document: { userId, status: "PENDING" }, signingStatus: "NOT_SIGNED" },
    include: { document: { include: { user: true } } },
  })
  if (!recipient) return { ok: false, error: "notFound" }
  const blocked = await senderBlocker(userId, 0)
  if (blocked) return { ok: false, error: blocked }
  const outcome = await sendSigningInvite({
    to: recipient.email,
    recipientName: recipient.name,
    senderName: recipient.document.user.name || recipient.document.user.email,
    title: recipient.document.title,
    message: recipient.document.message,
    url: signingUrl(appUrl(), recipient.token),
    expiresAt: recipient.expiresAt,
    reminder: true,
  })
  // A resend is nothing but its email: refused means nothing happened, so
  // nothing is stamped or audited and the sender is offered a retry.
  if (!delivered(outcome)) return { ok: false, error: "emailFailed" }
  // No provider: nothing was sent, so nothing is stamped "Sent" or audited as
  // a reminder. It used to pass as delivered and record both.
  if (!emailed(outcome)) return { ok: false, error: "emailNotConfigured" }
  const now = new Date()
  // Previously stamped whether or not the email went:
  // await prisma.recipient.update({ where: { id: recipientId }, data: { lastReminderAt: new Date() } })
  await prisma.recipient.update({
    where: { id: recipientId },
    // A resend that gets through also settles an invite that did not.
    data: { lastReminderAt: now, sentAt: recipient.sentAt ?? now },
  })
  await recordAudit(prisma, {
    documentId: recipient.documentId,
    recipientId,
    type: AUDIT.REMINDER_SENT,
    actorEmail: recipient.document.user.email,
  })
  return { ok: true }
}
