/**
 * The signing state machine, as pure functions.
 *
 * Everything that decides "may this recipient act now?", "is the document
 * done?" or "who gets the next email?" lives here, with no database and no
 * clock of its own (callers pass `now`). The services in this folder load rows,
 * ask these functions, and write the outcome. Keeping the rules pure is what
 * lets `rules.test.ts` cover every branch without a database.
 *
 * Written from scratch for Salsox. The overall shape (per-recipient tokens,
 * signing order, role-based completion) follows how e-signature products
 * generally work; no code from AGPL projects was used.
 */
import type {
  DocumentStatus,
  RecipientRole,
  SigningOrder,
  SigningStatus,
} from "@prisma/client"

export type RuleRecipient = {
  id: string
  role: RecipientRole
  order: number
  signingStatus: SigningStatus
  expiresAt: Date | null
  mustPay?: boolean
}

export type RuleDocument = {
  status: DocumentStatus
  signingOrder: SigningOrder
  paymentAmount?: number | null
}

export type RuleField = {
  recipientId: string
  required: boolean
  inserted: boolean
}

/** Why a recipient cannot act right now. Null means they can. */
export type SigningBlocker =
  | "DOCUMENT_NOT_PENDING"
  | "ALREADY_SIGNED"
  | "REJECTED"
  | "EXPIRED"
  | "NOT_YOUR_TURN"
  | "NO_ACTION_REQUIRED"

const DAY_MS = 24 * 60 * 60 * 1000

/** Signers and approvers must act; viewers and CCs only receive the document. */
export function isActionable(role: RecipientRole): boolean {
  return role === "SIGNER" || role === "APPROVER"
}

export function actionableRecipients<R extends RuleRecipient>(all: R[]): R[] {
  return all.filter((r) => isActionable(r.role))
}

/** Expiry for a link issued at `now`, or null when the document never expires. */
export function computeExpiry(expiresInDays: number | null | undefined, now: Date): Date | null {
  if (!expiresInDays || expiresInDays <= 0) return null
  return new Date(now.getTime() + expiresInDays * DAY_MS)
}

export function isRecipientExpired(recipient: Pick<RuleRecipient, "expiresAt">, now: Date): boolean {
  return recipient.expiresAt !== null && recipient.expiresAt.getTime() <= now.getTime()
}

/**
 * In a SEQUENTIAL document a recipient's turn comes once every actionable
 * recipient with a lower `order` has signed. Recipients sharing an order sign
 * in parallel with each other. PARALLEL documents: always their turn.
 */
export function isRecipientTurn(
  recipient: RuleRecipient,
  all: RuleRecipient[],
  signingOrder: SigningOrder
): boolean {
  if (signingOrder === "PARALLEL") return true
  return actionableRecipients(all)
    .filter((r) => r.order < recipient.order)
    .every((r) => r.signingStatus === "SIGNED")
}

/** The first reason `recipient` may not sign, or null when they may. */
export function signingBlocker(
  document: RuleDocument,
  recipient: RuleRecipient,
  all: RuleRecipient[],
  now: Date
): SigningBlocker | null {
  if (!isActionable(recipient.role)) return "NO_ACTION_REQUIRED"
  if (recipient.signingStatus === "SIGNED") return "ALREADY_SIGNED"
  if (recipient.signingStatus === "REJECTED") return "REJECTED"
  // Checked before the document status: an EXPIRED document should tell the
  // signer their link expired, which is the thing they can ask to be fixed.
  if (document.status === "EXPIRED" || isRecipientExpired(recipient, now)) return "EXPIRED"
  if (document.status !== "PENDING") return "DOCUMENT_NOT_PENDING"
  if (!isRecipientTurn(recipient, all, document.signingOrder)) return "NOT_YOUR_TURN"
  return null
}

/**
 * Who should be emailed a signing link right now: in PARALLEL, every
 * actionable recipient who has not signed; in SEQUENTIAL, only the lowest
 * pending order group. CC and viewers are emailed the finished document
 * instead (see `completedCopyRecipients`).
 */
export function recipientsToNotify<R extends RuleRecipient>(all: R[], signingOrder: SigningOrder): R[] {
  const pending = actionableRecipients(all).filter((r) => r.signingStatus === "NOT_SIGNED")
  if (signingOrder === "PARALLEL" || pending.length === 0) return pending
  const lowest = Math.min(...pending.map((r) => r.order))
  return pending.filter((r) => r.order === lowest)
}

/**
 * Recipients who should have an invitation by now and do not: it is their
 * turn on a pending document, and no email to them was ever accepted by the
 * provider (`sentAt` is only written on success). Someone further down a
 * sequential order is not in this list: they have not been emailed because it
 * is not their turn, which is not a failure. Neither is someone who has
 * already opened their link: it reached them another way (WhatsApp, SMS), so
 * there is nothing left to chase.
 */
export function undeliveredInvites<R extends RuleRecipient & { sentAt: Date | null; viewedAt: Date | null }>(
  documentStatus: DocumentStatus,
  all: R[],
  signingOrder: SigningOrder
): R[] {
  if (documentStatus !== "PENDING") return []
  return recipientsToNotify(all, signingOrder).filter((r) => r.sentAt === null && r.viewedAt === null)
}

/**
 * Splits `undeliveredInvites` by why the invitation is missing. With an email
 * provider configured, a missing invitation is one the provider refused: say
 * "not delivered" and offer a resend. Without one, nothing was ever going to
 * be sent: the sender has to share those links by hand, and a resend would
 * achieve nothing. Before this split, the second case was hidden by stamping
 * those recipients "Sent".
 */
export function missingInvites<R extends RuleRecipient & { sentAt: Date | null; viewedAt: Date | null }>(
  emailConfigured: boolean,
  documentStatus: DocumentStatus,
  all: R[],
  signingOrder: SigningOrder
): { undelivered: R[]; shareByHand: R[] } {
  const missing = undeliveredInvites(documentStatus, all, signingOrder)
  return emailConfigured ? { undelivered: missing, shareByHand: [] } : { undelivered: [], shareByHand: missing }
}

/** A document is complete once it has actionable recipients and all of them signed. */
export function isDocumentComplete(all: RuleRecipient[]): boolean {
  const actionable = actionableRecipients(all)
  return actionable.length > 0 && actionable.every((r) => r.signingStatus === "SIGNED")
}

/**
 * What finalizing a document still has to do, or null when nothing.
 *
 * - `SEAL_AND_COMPLETE`: every signer is done and the document is still
 *   PENDING. The sealed copy, its fingerprint, the COMPLETED status and the
 *   COMPLETED audit event are then written in one transaction, so a document
 *   is never COMPLETED without the rest. This is also the state a crash
 *   mid-finalization leaves behind: nothing from the attempt was committed.
 * - `SEAL_ONLY`: COMPLETED with no sealed copy, which only the earlier
 *   two-step finalization could produce (status first, seal later).
 */
export type FinalizeStep = "SEAL_AND_COMPLETE" | "SEAL_ONLY"

export function finalizeStep(
  status: DocumentStatus,
  sealedKey: string | null,
  recipients: RuleRecipient[]
): FinalizeStep | null {
  if (sealedKey) return null
  if (status === "PENDING") return isDocumentComplete(recipients) ? "SEAL_AND_COMPLETE" : null
  if (status === "COMPLETED") return "SEAL_ONLY"
  return null
}

/**
 * How long finalization may take before a document counts as stuck. Sealing
 * runs inside the last signer's request and takes seconds; anything older
 * than this is not still in flight, so recovering it does not race a live
 * attempt (and if it did, the commit is guarded and only one would win).
 */
export const FINALIZE_GRACE_MS = 5 * 60 * 1000

/**
 * True when a document should have been finalized and was not, and enough
 * time has passed that no request is still working on it: what the recovery
 * sweep and the owner's document page pick up.
 */
export function isStuckFinalization(
  document: { status: DocumentStatus; sealedKey: string | null; completedAt: Date | null },
  recipients: (RuleRecipient & { signedAt: Date | null })[],
  now: Date,
  graceMs = FINALIZE_GRACE_MS
): boolean {
  const step = finalizeStep(document.status, document.sealedKey, recipients)
  if (!step) return false
  const times =
    step === "SEAL_ONLY"
      ? [document.completedAt]
      : actionableRecipients(recipients).map((r) => r.signedAt)
  const last = Math.max(...times.map((t) => t?.getTime() ?? 0))
  return now.getTime() - last >= graceMs
}

/** Required fields of one recipient that are still empty. */
export function missingRequiredFields<F extends RuleField>(fields: F[], recipientId: string): F[] {
  return fields.filter((f) => f.recipientId === recipientId && f.required && !f.inserted)
}

/**
 * Sign & Pay gate: true while this recipient still owes the document's
 * payment. Completion is refused until the provider webhook marks it PAID.
 */
export function paymentOutstanding(
  document: Pick<RuleDocument, "paymentAmount">,
  recipient: Pick<RuleRecipient, "mustPay">,
  paid: boolean
): boolean {
  return Boolean(document.paymentAmount && document.paymentAmount > 0 && recipient.mustPay && !paid)
}

/**
 * Whether a recipient's email/name can still be corrected in place. Only
 * before they sign, and only on a live (or expired, i.e. revivable) document:
 * a signature given under one identity is never reassigned to another.
 */
export function canEditRecipient(
  documentStatus: DocumentStatus,
  recipient: Pick<RuleRecipient, "signingStatus">
): boolean {
  return (
    (documentStatus === "PENDING" || documentStatus === "EXPIRED") &&
    recipient.signingStatus === "NOT_SIGNED"
  )
}

/**
 * Whether a recipient's link may still serve the original PDF. Only while the
 * document is live (PENDING, and their own link has not run out) or finished
 * (COMPLETED, where everyone keeps their copy). A draft was never sent; a
 * cancelled, declined or expired document was withdrawn, and a link that
 * stopped letting someone sign must stop letting them read the contract too.
 */
export function canViewOriginal(
  documentStatus: DocumentStatus,
  recipient: Pick<RuleRecipient, "expiresAt">,
  now: Date
): boolean {
  if (documentStatus === "COMPLETED") return true
  return documentStatus === "PENDING" && !isRecipientExpired(recipient, now)
}

/** A document can be renewed (links extended and resent) while pending or expired. */
export function canRenewDocument(documentStatus: DocumentStatus): boolean {
  return documentStatus === "PENDING" || documentStatus === "EXPIRED"
}

/** Used by the expiry sweep: a pending document expires once any unsigned actionable link has. */
export function shouldExpireDocument(
  document: Pick<RuleDocument, "status">,
  all: RuleRecipient[],
  now: Date
): boolean {
  if (document.status !== "PENDING") return false
  return actionableRecipients(all).some(
    (r) => r.signingStatus === "NOT_SIGNED" && isRecipientExpired(r, now)
  )
}
