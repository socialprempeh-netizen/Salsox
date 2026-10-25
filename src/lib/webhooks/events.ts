/**
 * The webhook events an account can subscribe to, and which signing-engine
 * event each one comes from. The engine records every state change in its
 * audit trail (src/lib/esign/audit.ts); a webhook is that change, sent out.
 *
 *   document.sent       DOCUMENT_SENT       the sender sent it for signing
 *   document.viewed     DOCUMENT_VIEWED     a recipient opened it, first time
 *   document.signed     RECIPIENT_SIGNED    one recipient finished signing
 *   document.completed  DOCUMENT_COMPLETED  everyone signed; the sealed PDF exists
 *   payment.sent        PAYMENT_RECEIVED    a signer paid through Sign & Pay
 *   document.declined   RECIPIENT_REJECTED  a recipient declined to sign
 *   document.expired    DOCUMENT_EXPIRED    the signing links lapsed unsigned
 *
 * (The last two were added beyond the first five so an integration can
 * react to a document that will not complete, not only to one that does.)
 *
 * Each engine event already happens once per occurrence (a second view of
 * the same link is not recorded, a signature cannot be recorded twice), so a
 * webhook needs no de-duplication of its own. Names follow the
 * "resource.action" shape integration platforms expect.
 */

export const WEBHOOK_EVENTS = ["document.sent", "document.viewed", "document.signed", "document.completed", "payment.sent", "document.declined", "document.expired"] as const
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number]

const FROM_AUDIT: Record<string, WebhookEvent> = {
  DOCUMENT_SENT: "document.sent",
  DOCUMENT_VIEWED: "document.viewed",
  RECIPIENT_SIGNED: "document.signed",
  DOCUMENT_COMPLETED: "document.completed",
  PAYMENT_RECEIVED: "payment.sent",
  RECIPIENT_REJECTED: "document.declined",
  DOCUMENT_EXPIRED: "document.expired",
}

/** The webhook an engine audit event becomes, or null for one that is not sent out. */
export function webhookEventFor(auditType: string): WebhookEvent | null {
  return FROM_AUDIT[auditType] ?? null
}

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value as string)
}

/** A subscription list, de-duplicated and in the canonical order; unknown names dropped. */
export function normalizeEvents(values: unknown[]): WebhookEvent[] {
  return WEBHOOK_EVENTS.filter((e) => values.includes(e))
}
