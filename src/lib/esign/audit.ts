/**
 * Append-only audit trail for documents.
 *
 * Each event records who did what, from which IP and user agent, and when.
 * The trail is printed on the certificate page of the sealed PDF, so it is the
 * evidence behind every signature: events are only ever inserted.
 */
import { headers } from "next/headers"
import type { Prisma, PrismaClient } from "@prisma/client"

export const AUDIT = {
  CREATED: "DOCUMENT_CREATED",
  SENT: "DOCUMENT_SENT",
  VIEWED: "DOCUMENT_VIEWED",
  FIELD_SIGNED: "FIELD_SIGNED",
  RECIPIENT_SIGNED: "RECIPIENT_SIGNED",
  RECIPIENT_REJECTED: "RECIPIENT_REJECTED",
  RECIPIENT_UPDATED: "RECIPIENT_UPDATED",
  DOCUMENT_RENEWED: "DOCUMENT_RENEWED",
  REMINDER_SENT: "REMINDER_SENT",
  PAYMENT_STARTED: "PAYMENT_STARTED",
  PAYMENT_RECEIVED: "PAYMENT_RECEIVED",
  COMPLETED: "DOCUMENT_COMPLETED",
  CANCELLED: "DOCUMENT_CANCELLED",
  EXPIRED: "DOCUMENT_EXPIRED",
} as const

export type AuditType = (typeof AUDIT)[keyof typeof AUDIT]

type Db = PrismaClient | Prisma.TransactionClient

export type RequestMeta = { ipAddress: string | null; userAgent: string | null }

/** IP and user agent of the current request; nulls outside a request (cron, webhooks). */
export async function requestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers()
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim()
    return { ipAddress: forwarded || h.get("x-real-ip"), userAgent: h.get("user-agent") }
  } catch {
    return { ipAddress: null, userAgent: null }
  }
}

export async function recordAudit(
  db: Db,
  event: {
    documentId: string
    type: AuditType
    recipientId?: string | null
    actorEmail?: string | null
    data?: Prisma.InputJsonValue
    meta?: RequestMeta
  }
): Promise<void> {
  await db.auditEvent.create({
    data: {
      documentId: event.documentId,
      type: event.type,
      recipientId: event.recipientId ?? null,
      actorEmail: event.actorEmail ?? null,
      data: event.data,
      ipAddress: event.meta?.ipAddress ?? null,
      userAgent: event.meta?.userAgent ?? null,
    },
  })
}
