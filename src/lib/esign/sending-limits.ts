/**
 * Who may send, and how much: the abuse rules for outgoing signing emails.
 *
 * A signing invite is an email to an address the sender typed, carrying a
 * message the sender wrote, sent from this deployment's domain. Left open,
 * that is a spam relay. Three things close it, and all three are decided here
 * as pure functions (no database, no clock of their own), so the test beside
 * this file covers every branch:
 *
 *   1. A sender must have confirmed their own email address first.
 *   2. A daily ceiling on documents sent and recipients emailed, far above
 *      what a person sends by hand and far below what a script wants. A new
 *      account gets a lower ceiling, because a fresh account is what abuse
 *      looks like.
 *   3. Short burst limits, applied by the server actions through the shared
 *      rate limiter.
 *
 * These are not plan limits. Nothing here reads the subscription, no plan
 * raises or lowers them, and an ordinary sender never meets them: "no envelope
 * caps" still describes every plan. `sender.ts` loads the facts these
 * functions need; `documents.ts` and `recipients.ts` ask before emailing.
 */

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000

/** Recipients on one document. Most contracts have two to five. */
export const MAX_RECIPIENTS_PER_DOCUMENT = 10

/** An account younger than this is on the lower daily ceiling. */
export const NEW_ACCOUNT_DAYS = 7

export type SenderTrust = "NEW" | "ESTABLISHED"

/** Rolling 24 hour ceilings per sender. */
export const DAILY_LIMITS: Record<SenderTrust, { documents: number; recipients: number }> = {
  NEW: { documents: 10, recipients: 30 },
  ESTABLISHED: { documents: 100, recipients: 300 },
}

/**
 * Burst limits for the server actions (`checkRateLimit`). Per user unless the
 * name says otherwise.
 */
export const BURST_LIMITS = {
  /** Sending a document (editor or Quick Send). */
  send: { max: 10, windowMs: 10 * MINUTE_MS },
  /** Uploading a PDF to start a draft. */
  upload: { max: 30, windowMs: 10 * MINUTE_MS },
  /** Reminding or renewing, per document: each one emails every pending signer. */
  nudge: { max: 3, windowMs: 60 * MINUTE_MS },
  /** Correcting a recipient: a changed address gets a fresh invite. */
  recipientEdit: { max: 10, windowMs: 60 * MINUTE_MS },
} as const

/**
 * Whether senders must have a confirmed email on this deployment.
 *
 * Tied to email being configured, for two reasons that point the same way.
 * Without a Resend key no confirmation email can be sent, so requiring one
 * would lock every password account out of sending for good. And without a
 * key no invite leaves the server either (links are shared by hand), so there
 * is nothing for the requirement to protect.
 */
export function emailConfirmationRequired(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.RESEND_API_KEY)
}

export function senderTrust(accountCreatedAt: Date, now: Date): SenderTrust {
  return now.getTime() - accountCreatedAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS ? "NEW" : "ESTABLISHED"
}

/** Start of the rolling window the daily ceilings are counted over. */
export function dailyWindowStart(now: Date): Date {
  return new Date(now.getTime() - DAY_MS)
}

/** Why a sender cannot email recipients right now. Null means they can. */
export type SendingBlocker = "emailNotConfirmed" | "dailyLimit"

export type SenderFacts = {
  emailVerified: boolean
  accountCreatedAt: Date
  /** Documents sent, and recipients on them, inside the daily window. */
  usage: { documents: number; recipients: number }
}

/**
 * The first reason this sender may not send, or null when they may.
 *
 * `addingRecipients` is what the action about to run would add: the
 * document's recipient count for a new send, zero for a reminder or a renewal
 * (those re-email people already counted, so they need a confirmed sender but
 * never consume the ceiling).
 */
export function sendingBlocker(
  sender: SenderFacts,
  addingRecipients: number,
  now: Date,
  confirmationRequired: boolean = emailConfirmationRequired()
): SendingBlocker | null {
  if (confirmationRequired && !sender.emailVerified) return "emailNotConfirmed"
  if (addingRecipients <= 0) return null
  const limits = DAILY_LIMITS[senderTrust(sender.accountCreatedAt, now)]
  if (sender.usage.documents + 1 > limits.documents) return "dailyLimit"
  if (sender.usage.recipients + addingRecipients > limits.recipients) return "dailyLimit"
  return null
}
