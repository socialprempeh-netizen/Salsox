/**
 * What a webhook carries, and how a receiver proves it came from us.
 *
 * The body is JSON in snake_case, the shape integration platforms (Zapier,
 * Make, HubSpot) handle without mapping:
 *
 *   { id, event, created_at, test, data: { document, recipient, recipients, payment } }
 *
 * - `id` is the event's own id: a receiver can use it to drop a repeat, as a
 *   failed delivery is retried with the same id.
 * - `recipient` is the person the event is about (who viewed, signed or
 *   paid), null for document-level events; `recipients` is everyone.
 * - Amounts are integers in the currency's minor unit (cents, pesewas, kobo).
 * - Never included: signing links or their tokens (each one opens the
 *   document for that signer), phone numbers, IP addresses.
 *
 * Signing: the `Webhook-Signature` header is `t=<unix seconds>,v1=<hex>`,
 * where hex is HMAC-SHA256 of `<t>.<raw body>` with the endpoint's secret.
 * The timestamp lets a receiver refuse an old message replayed later.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import type { WebhookEvent } from "./events"

export type PayloadRecipient = {
  id: string
  name: string
  email: string
  role: string
  order: number
  status: string
  viewed_at: string | null
  signed_at: string | null
  /** What a recipient who declined wrote, or null. */
  decline_reason: string | null
}

export type WebhookPayload = {
  id: string
  event: WebhookEvent
  created_at: string
  test: boolean
  data: {
    document: {
      id: string
      title: string
      status: string
      created_at: string
      sent_at: string | null
      completed_at: string | null
      page_count: number
      signing_order: string
      url: string
    }
    recipient: PayloadRecipient | null
    recipients: PayloadRecipient[]
    payment: { id: string; amount: number; currency: string; status: string; provider: string; paid_at: string | null } | null
  }
}

type DocumentIn = {
  id: string
  title: string
  status: string
  createdAt: Date
  sentAt: Date | null
  completedAt: Date | null
  pageCount: number
  signingOrder: string
  recipients: { id: string; name: string; email: string; role: string; order: number; signingStatus: string; viewedAt: Date | null; signedAt: Date | null; rejectionReason?: string | null }[]
}
type PaymentIn = { id: string; amount: number; currency: string; status: string; provider: string; paidAt: Date | null }

const iso = (d: Date | null) => (d ? d.toISOString() : null)

/** The payload for one event, from the document as it stands now. */
export function buildPayload(input: {
  id: string
  event: WebhookEvent
  at: Date
  test?: boolean
  appUrl: string
  document: DocumentIn
  recipientId?: string | null
  payment?: PaymentIn | null
}): WebhookPayload {
  const { document: d } = input
  const recipients = [...d.recipients]
    .sort((a, b) => a.order - b.order || a.email.localeCompare(b.email))
    .map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, order: r.order, status: r.signingStatus, viewed_at: iso(r.viewedAt), signed_at: iso(r.signedAt), decline_reason: r.rejectionReason ?? null }))
  const p = input.payment
  return {
    id: input.id,
    event: input.event,
    created_at: input.at.toISOString(),
    test: input.test ?? false,
    data: {
      document: {
        id: d.id,
        title: d.title,
        status: d.status,
        created_at: d.createdAt.toISOString(),
        sent_at: iso(d.sentAt),
        completed_at: iso(d.completedAt),
        page_count: d.pageCount,
        signing_order: d.signingOrder,
        url: `${input.appUrl.replace(/\/+$/, "")}/dashboard/documents/${d.id}`,
      },
      recipient: recipients.find((r) => r.id === input.recipientId) ?? null,
      recipients,
      payment: p ? { id: p.id, amount: p.amount, currency: p.currency.toLowerCase(), status: p.status, provider: p.provider, paid_at: iso(p.paidAt) } : null,
    },
  }
}

/**
 * A realistic payload for an event, for the "Send test" button and for
 * integration platforms that ask for a sample before any real event exists.
 */
export function samplePayload(event: WebhookEvent, appUrl: string, at = new Date()): WebhookPayload {
  const minutes = (m: number) => new Date(at.getTime() - m * 60_000)
  const signed = event === "document.signed" || event === "document.completed" || event === "payment.sent"
  const viewed = event !== "document.sent" && event !== "document.expired"
  const done = event === "document.completed"
  const declined = event === "document.declined"
  const document: DocumentIn = {
    id: "doc_sample_1a2b3c",
    title: "Service agreement",
    status: done ? "COMPLETED" : declined ? "REJECTED" : event === "document.expired" ? "EXPIRED" : "PENDING",
    createdAt: minutes(90),
    sentAt: minutes(60),
    completedAt: done ? at : null,
    pageCount: 3,
    signingOrder: "PARALLEL",
    recipients: [
      { id: "rcp_sample_ama", name: "Ama Mensah", email: "ama@example.com", role: "SIGNER", order: 0, signingStatus: signed ? "SIGNED" : declined ? "REJECTED" : "NOT_SIGNED", viewedAt: viewed ? minutes(20) : null, signedAt: signed ? minutes(5) : null, rejectionReason: declined ? "The deposit amount is wrong." : null },
      { id: "rcp_sample_kofi", name: "Kofi Boateng", email: "kofi@example.com", role: "SIGNER", order: 1, signingStatus: done ? "SIGNED" : "NOT_SIGNED", viewedAt: done ? minutes(10) : null, signedAt: done ? minutes(1) : null },
    ],
  }
  return buildPayload({
    id: "evt_sample",
    event,
    at,
    test: true,
    appUrl,
    document,
    recipientId: event === "document.sent" || event === "document.completed" || event === "document.expired" ? null : "rcp_sample_ama",
    payment: event === "payment.sent" ? { id: "pay_sample", amount: 25_000, currency: "usd", status: "PAID", provider: "STRIPE", paidAt: minutes(4) } : null,
  })
}

/** The `Webhook-Signature` header for a body. */
export function signatureHeader(secret: string, body: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000)
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")
  return `t=${t},v1=${v1}`
}

/**
 * The receiver's check, published in the docs and kept here so the two stay
 * the same: a matching v1 and a timestamp no older than `toleranceSeconds`.
 */
export function verifySignature(secret: string, body: string, header: string, now = new Date(), toleranceSeconds = 300): boolean {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.trim().split("=") as [string, string]))
  const t = Number(parts.t)
  if (!Number.isInteger(t) || !parts.v1) return false
  if (Math.abs(now.getTime() / 1000 - t) > toleranceSeconds) return false
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest()
  const given = Buffer.from(parts.v1, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}
