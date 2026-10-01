/**
 * Abuse signals for the moderation view (/admin/moderation), as pure
 * functions.
 *
 * Unlimited sending is only safe with someone watching. The sending limits
 * (sending-limits.ts) stop the worst bursts automatically; this file names
 * the patterns worth a human look before they become a deliverability or
 * fraud problem: e-signature links are a favourite phishing lure, and an
 * account that sends many documents nobody signs, or that its recipients
 * reject, is the shape that takes.
 *
 * Each signal says what it saw, so an admin can judge it rather than trust a
 * score. The page loads per-account counts over a recent window and asks
 * `moderationSignals`; nothing here acts on an account.
 */
import { DAILY_LIMITS, senderTrust } from "./sending-limits"

export type SenderActivity = {
  accountCreatedAt: Date
  emailVerified: boolean
  /** Documents sent in the last 24 hours. */
  documentsLast24h: number
  /** Documents sent in the window the page looks at (30 days). */
  documentsInWindow: number
  /** Of those, how many were completed. */
  completedInWindow: number
  /** Recipients who rejected, and recipients in total, on those documents. */
  rejectedRecipients: number
  totalRecipients: number
  /** Sign & Pay disputes (chargebacks) raised against this sender, ever. */
  disputes: number
}

export type SignalKind =
  | "disputes"
  | "highRejection"
  | "nearDailyCeiling"
  | "newAccountBurst"
  | "lowCompletion"
  | "unconfirmedSender"

export type Signal = { kind: SignalKind; severity: "high" | "medium"; values: Record<string, number> }

/** Thresholds, named so the page can print what each flag means. */
export const MODERATION = {
  windowDays: 30,
  /** Share of a daily ceiling that counts as "near" it. */
  nearCeilingShare: 0.8,
  /** Rejection rate worth a look, once there are enough recipients to judge. */
  rejectionRate: 0.3,
  minRecipientsForRate: 5,
  /** Documents from an account in its first week that count as a burst. */
  newAccountDocuments: 5,
  /** Completion rate below this, over enough documents, is suspicious. */
  lowCompletionRate: 0.1,
  minDocumentsForCompletion: 10,
}

export function moderationSignals(a: SenderActivity, now: Date, emailConfirmationRequired: boolean): Signal[] {
  const signals: Signal[] = []
  const trust = senderTrust(a.accountCreatedAt, now)

  if (a.disputes > 0) signals.push({ kind: "disputes", severity: "high", values: { disputes: a.disputes } })

  if (a.totalRecipients >= MODERATION.minRecipientsForRate) {
    const rate = a.rejectedRecipients / a.totalRecipients
    if (rate >= MODERATION.rejectionRate) {
      signals.push({ kind: "highRejection", severity: "high", values: { percent: Math.round(rate * 100), rejected: a.rejectedRecipients } })
    }
  }

  const ceiling = DAILY_LIMITS[trust].documents
  if (a.documentsLast24h >= Math.ceil(ceiling * MODERATION.nearCeilingShare)) {
    signals.push({ kind: "nearDailyCeiling", severity: "medium", values: { sent: a.documentsLast24h, ceiling } })
  }

  if (trust === "NEW" && a.documentsInWindow >= MODERATION.newAccountDocuments) {
    signals.push({ kind: "newAccountBurst", severity: "medium", values: { sent: a.documentsInWindow } })
  }

  if (a.documentsInWindow >= MODERATION.minDocumentsForCompletion) {
    const rate = a.completedInWindow / a.documentsInWindow
    if (rate < MODERATION.lowCompletionRate) {
      signals.push({ kind: "lowCompletion", severity: "medium", values: { percent: Math.round(rate * 100), sent: a.documentsInWindow } })
    }
  }

  // Only meaningful where confirmation is enforced (an email provider is
  // configured): elsewhere every sender is unconfirmed by design.
  if (emailConfirmationRequired && !a.emailVerified && a.documentsInWindow > 0) {
    signals.push({ kind: "unconfirmedSender", severity: "medium", values: { sent: a.documentsInWindow } })
  }

  return signals
}

/** High-severity signals first, then by how many signals an account has. */
export function rankFlagged<T extends { signals: Signal[] }>(accounts: T[]): T[] {
  const weight = (s: Signal[]) => s.filter((x) => x.severity === "high").length * 10 + s.length
  return accounts.filter((a) => a.signals.length > 0).sort((a, b) => weight(b.signals) - weight(a.signals))
}
