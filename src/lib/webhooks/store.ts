/**
 * Webhooks, the database side: an account's endpoints, turning an engine
 * event into deliveries, and sending them (deliver.ts) with retries.
 *
 * - queueWebhookEvent is called by the signing engine when an audit event
 *   that maps to a webhook is recorded (src/lib/esign/audit.ts, and after the
 *   signing and completion transactions commit). It NEVER throws: a webhook
 *   problem must not stop a signature. It writes one delivery per subscribed
 *   endpoint, with the payload fixed then, and sends them once the response
 *   has gone (next/server `after`), or straight away outside a request.
 * - attemptDelivery claims a delivery before sending, so the cron, a new
 *   event and a person pressing Resend cannot send the same one twice.
 * - deliverDue sends whatever is waiting for a retry; the daily cron calls it.
 */
import { randomBytes } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { auditTypesFor, normalizeEvents, webhookEventFor, type WebhookEvent } from "./events"
import { buildPayload, samplePayload, type WebhookPayload } from "./payload"
import { isSuccess, nextAttemptAt } from "./retry"
import { newWebhookSecret, openSecret, sealSecret } from "./secret-box"
import { checkWebhookUrl, type UrlProblem } from "./url-safety"
import { sendWebhook } from "./deliver"

/** Endpoints per account: enough for a few integrations, not a fan-out tool. */
export const MAX_ENDPOINTS = 10
/** How long a claimed delivery is held before another run may retry it. */
const CLAIM_MS = 2 * 60_000

const allowLocalHttp = () => process.env.NODE_ENV === "development"
const newEventId = () => `evt_${randomBytes(12).toString("hex")}`

// ─── Endpoints ──────────────────────────────────────────────────────────────

export type EndpointError = UrlProblem | "events" | "limit" | "notFound"

export async function listEndpoints(userId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      url: true,
      events: true,
      enabled: true,
      description: true,
      source: true,
      createdAt: true,
      deliveries: { orderBy: { createdAt: "desc" }, take: 8, select: { id: true, event: true, status: true, attempts: true, responseStatus: true, error: true, test: true, createdAt: true, deliveredAt: true, nextAttemptAt: true } },
    },
  })
}

/** A new endpoint, and its signing secret, which is shown this once. */
export async function createEndpoint(userId: string, input: { url: string; events: unknown[]; description?: string | null; source?: "ui" | "api" }): Promise<{ ok: true; id: string; secret: string; url: string; events: WebhookEvent[] } | { ok: false; error: EndpointError }> {
  const checked = checkWebhookUrl(input.url, { allowLocalHttp: allowLocalHttp() })
  if (!checked.ok) return { ok: false, error: checked.problem }
  const events = normalizeEvents(input.events)
  if (events.length === 0) return { ok: false, error: "events" }
  if ((await prisma.webhookEndpoint.count({ where: { userId } })) >= MAX_ENDPOINTS) return { ok: false, error: "limit" }
  const secret = newWebhookSecret()
  const row = await prisma.webhookEndpoint.create({
    data: { userId, url: checked.url, events, secret: sealSecret(secret), description: input.description?.trim().slice(0, 120) || null, source: input.source ?? "ui" },
    select: { id: true },
  })
  return { ok: true, id: row.id, secret, url: checked.url, events }
}

export async function updateEndpoint(userId: string, id: string, input: { url?: string; events?: unknown[]; enabled?: boolean; description?: string | null }): Promise<{ ok: true } | { ok: false; error: EndpointError }> {
  const data: Prisma.WebhookEndpointUpdateInput = {}
  if (input.url !== undefined) {
    const checked = checkWebhookUrl(input.url, { allowLocalHttp: allowLocalHttp() })
    if (!checked.ok) return { ok: false, error: checked.problem }
    data.url = checked.url
  }
  if (input.events !== undefined) {
    const events = normalizeEvents(input.events)
    if (events.length === 0) return { ok: false, error: "events" }
    data.events = events
  }
  if (input.enabled !== undefined) data.enabled = input.enabled
  if (input.description !== undefined) data.description = input.description?.trim().slice(0, 120) || null
  const updated = await prisma.webhookEndpoint.updateMany({ where: { id, userId }, data })
  return updated.count ? { ok: true } : { ok: false, error: "notFound" }
}

export async function deleteEndpoint(userId: string, id: string): Promise<boolean> {
  return (await prisma.webhookEndpoint.deleteMany({ where: { id, userId } })).count > 0
}

/** A new secret for an endpoint; the old one stops verifying at once. */
export async function rotateEndpointSecret(userId: string, id: string): Promise<string | null> {
  const secret = newWebhookSecret()
  const updated = await prisma.webhookEndpoint.updateMany({ where: { id, userId }, data: { secret: sealSecret(secret) } })
  return updated.count ? secret : null
}

// ─── Events into deliveries ────────────────────────────────────────────────

/**
 * Turns an engine audit event into deliveries for the document owner's
 * subscribed endpoints. Never throws; returns the delivery ids it created.
 */
export async function queueWebhookEvent(input: { documentId: string; auditType: string; recipientId?: string | null }): Promise<string[]> {
  try {
    const event = webhookEventFor(input.auditType)
    if (!event) return []
    const document = await prisma.document.findUnique({
      where: { id: input.documentId },
      select: {
        id: true,
        userId: true,
        title: true,
        status: true,
        createdAt: true,
        sentAt: true,
        completedAt: true,
        pageCount: true,
        signingOrder: true,
        recipients: { select: { id: true, name: true, email: true, role: true, order: true, signingStatus: true, viewedAt: true, signedAt: true, rejectionReason: true } },
      },
    })
    if (!document) return []
    const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId: document.userId, enabled: true, events: { has: event } }, select: { id: true } })
    if (endpoints.length === 0) return []
    const payment =
      event === "payment.sent"
        ? await prisma.payment.findFirst({
            where: { documentId: document.id, status: "PAID", ...(input.recipientId ? { recipientId: input.recipientId } : {}) },
            orderBy: { paidAt: "desc" },
            select: { id: true, amount: true, currency: true, status: true, provider: true, paidAt: true },
          })
        : null
    const eventId = newEventId()
    const payload = buildPayload({ id: eventId, event, at: new Date(), appUrl: siteConfig.url, document, recipientId: input.recipientId, payment })
    const ids: string[] = []
    for (const e of endpoints) {
      const row = await prisma.webhookDelivery.create({ data: { endpointId: e.id, eventId, event, payload: payload as unknown as Prisma.InputJsonValue }, select: { id: true } })
      ids.push(row.id)
    }
    sendSoon(ids)
    return ids
  } catch (error) {
    console.warn("[webhooks] event not queued", error)
    return []
  }
}

/**
 * Most events an integration may ask for at once (GET /api/v1/events). Was
 * 25: Zapier asks that the list behind an instant trigger follow its polling
 * rules, which expect up to 100 items, newest first.
 */
export const RECENT_EVENTS_MAX = 100

/**
 * The account's latest real events of one kind, newest first, as webhook
 * payloads. Integration platforms ask for these while someone builds a
 * workflow (Zapier's "perform list" for an instant trigger) so the test step
 * shows the user's own data rather than a sample.
 *
 * Rebuilt from the audit trail, the same source webhooks come from, with the
 * same builder. Two differences from a delivery: the `id` is derived from the
 * audit row (`evt_a_<id>`), so the same event has the same id on every call,
 * and the document is shown as it stands now, not as it stood at the event.
 */
export async function recentEvents(userId: string, event: WebhookEvent, limit = 3): Promise<WebhookPayload[]> {
  const auditTypes = auditTypesFor(event)
  const rows = await prisma.auditEvent.findMany({
    where: { type: { in: auditTypes }, document: { userId } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), RECENT_EVENTS_MAX),
    select: {
      id: true,
      createdAt: true,
      recipientId: true,
      document: {
        select: {
          id: true,
          title: true,
          status: true,
          createdAt: true,
          sentAt: true,
          completedAt: true,
          pageCount: true,
          signingOrder: true,
          recipients: { select: { id: true, name: true, email: true, role: true, order: true, signingStatus: true, viewedAt: true, signedAt: true, rejectionReason: true } },
        },
      },
    },
  })
  const out: WebhookPayload[] = []
  for (const row of rows) {
    const payment =
      event === "payment.sent"
        ? await prisma.payment.findFirst({
            where: { documentId: row.document.id, status: "PAID", ...(row.recipientId ? { recipientId: row.recipientId } : {}), paidAt: { lte: new Date(row.createdAt.getTime() + 60_000) } },
            orderBy: { paidAt: "desc" },
            select: { id: true, amount: true, currency: true, status: true, provider: true, paidAt: true },
          })
        : null
    out.push(buildPayload({ id: `evt_a_${row.id}`, event, at: row.createdAt, appUrl: siteConfig.url, document: row.document, recipientId: row.recipientId, payment }))
  }
  return out
}

/**
 * Sends after the response when inside a request, so the person signing does
 * not wait on someone else's server; otherwise (a cron, a script) now.
 */
function sendSoon(ids: string[]) {
  const run = async () => {
    for (const id of ids) await attemptDelivery(id).catch((e) => console.warn("[webhooks] delivery failed", e))
  }
  import("next/server")
    .then(({ after }) => after(run))
    .catch(() => void run())
}

// ─── Sending ────────────────────────────────────────────────────────────────

export type AttemptResult = { status: "SUCCEEDED" | "PENDING" | "FAILED" | "skipped"; responseStatus: number | null; error: string | null }

/** One attempt at one delivery, if it is due and nobody else holds it. */
export async function attemptDelivery(id: string, now = new Date()): Promise<AttemptResult> {
  const claimed = await prisma.webhookDelivery.updateMany({
    where: { id, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + CLAIM_MS) },
  })
  if (claimed.count === 0) return { status: "skipped", responseStatus: null, error: null }
  const delivery = await prisma.webhookDelivery.findUniqueOrThrow({
    where: { id },
    select: { eventId: true, event: true, payload: true, attempts: true, endpoint: { select: { url: true, secret: true, enabled: true } } },
  })
  const attempts = delivery.attempts + 1
  const finish = async (ok: boolean, responseStatus: number | null, error: string | null, giveUp = false) => {
    const retryAt = ok || giveUp ? null : nextAttemptAt(attempts, now)
    const status = ok ? "SUCCEEDED" : retryAt ? "PENDING" : "FAILED"
    await prisma.webhookDelivery.update({
      where: { id },
      data: { status, attempts, responseStatus, error, nextAttemptAt: retryAt, deliveredAt: ok ? now : null },
    })
    return { status, responseStatus, error } as AttemptResult
  }

  if (!delivery.endpoint.enabled) return finish(false, null, "endpoint turned off", true)
  const url = checkWebhookUrl(delivery.endpoint.url, { allowLocalHttp: allowLocalHttp() })
  if (!url.ok) return finish(false, null, `URL refused (${url.problem})`, true)
  let secret: string
  try {
    secret = openSecret(delivery.endpoint.secret)
  } catch {
    return finish(false, null, "signing secret unreadable: rotate it on the Developers page", true)
  }
  const result = await sendWebhook({ url: url.url, secret, eventId: delivery.eventId, event: delivery.event, body: JSON.stringify(delivery.payload), now })
  return finish(isSuccess(result.status ?? 0), result.status, result.error)
}

/** Sends what is waiting for a retry, oldest first. For the daily cron. */
export async function deliverDue(limit = 100, now = new Date()): Promise<{ attempted: number; succeeded: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  })
  let succeeded = 0
  for (const d of due) if ((await attemptDelivery(d.id, now)).status === "SUCCEEDED") succeeded++
  return { attempted: due.length, succeeded }
}

/** A sample event, marked test, sent now to one of the account's endpoints. */
export async function sendTestEvent(userId: string, endpointId: string, event: WebhookEvent): Promise<AttemptResult | null> {
  const endpoint = await prisma.webhookEndpoint.findFirst({ where: { id: endpointId, userId }, select: { id: true } })
  if (!endpoint) return null
  const payload = { ...samplePayload(event, siteConfig.url), id: newEventId() }
  const row = await prisma.webhookDelivery.create({
    data: { endpointId, eventId: payload.id, event, payload: payload as unknown as Prisma.InputJsonValue, test: true },
    select: { id: true },
  })
  // A test is tried once: its answer is what the person is waiting to see.
  const result = await attemptDelivery(row.id)
  if (result.status === "PENDING") await prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "FAILED", nextAttemptAt: null } })
  return result.status === "PENDING" ? { ...result, status: "FAILED" } : result
}

/** Sends a delivery again now, same event id and payload. */
export async function redeliver(userId: string, deliveryId: string): Promise<AttemptResult | null> {
  const reset = await prisma.webhookDelivery.updateMany({
    where: { id: deliveryId, endpoint: { userId }, status: { not: "SUCCEEDED" } },
    data: { status: "PENDING", nextAttemptAt: null, attempts: 0 },
  })
  if (reset.count === 0) return null
  return attemptDelivery(deliveryId)
}
