"use server"

/**
 * The Developers page's actions (/dashboard/developers): webhook endpoints
 * (add, change, turn off, delete, new secret, send a test, resend a delivery)
 * and personal API keys (create, revoke). Each acts on the signed-in
 * person's own records only, re-parses what arrives, and leaves the rules to
 * src/lib/webhooks and src/lib/api-keys-store.ts.
 *
 * A secret or key is returned once, to be shown once; it is never readable
 * again from the page.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireUser } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events"
import { createEndpoint, deleteEndpoint, redeliver, rotateEndpointSecret, sendTestEvent, updateEndpoint, type AttemptResult, type EndpointError } from "@/lib/webhooks/store"
import { createApiKey, revokeApiKey } from "@/lib/api-keys-store"

const PAGE = "/dashboard/developers"
const id = z.string().min(1).max(64)
const events = z.array(z.enum(WEBHOOK_EVENTS)).min(1)

export type EndpointResult = { ok: true; id?: string; secret?: string } | { ok: false; error: EndpointError | "invalid" | "rate" }

export async function createWebhookEndpoint(input: unknown): Promise<EndpointResult> {
  const user = await requireUser()
  const parsed = z.object({ url: z.string().max(2000), events, description: z.string().max(120).optional() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues.some((i) => i.path[0] === "events") ? "events" : "invalid" }
  if (!(await checkRateLimit(`webhook-create:${user.id}`, 20))) return { ok: false, error: "rate" }
  const created = await createEndpoint(user.id, parsed.data)
  if (!created.ok) return created
  revalidatePath(PAGE)
  return { ok: true, id: created.id, secret: created.secret }
}

export async function updateWebhookEndpoint(endpointId: unknown, patch: unknown): Promise<EndpointResult> {
  const user = await requireUser()
  const parsedId = id.safeParse(endpointId)
  const parsed = z.object({ url: z.string().max(2000), events, enabled: z.boolean(), description: z.string().max(120).nullable() }).partial().strict().safeParse(patch)
  if (!parsedId.success || !parsed.success) return { ok: false, error: "invalid" }
  const result = await updateEndpoint(user.id, parsedId.data, parsed.data)
  if (result.ok) revalidatePath(PAGE)
  return result
}

export async function deleteWebhookEndpoint(endpointId: unknown): Promise<boolean> {
  const user = await requireUser()
  const parsed = id.safeParse(endpointId)
  if (!parsed.success) return false
  const done = await deleteEndpoint(user.id, parsed.data)
  if (done) revalidatePath(PAGE)
  return done
}

export async function rotateWebhookSecret(endpointId: unknown): Promise<string | null> {
  const user = await requireUser()
  const parsed = id.safeParse(endpointId)
  if (!parsed.success) return null
  return rotateEndpointSecret(user.id, parsed.data)
}

export async function sendTestWebhook(endpointId: unknown, event: unknown): Promise<AttemptResult | { status: "rate" } | null> {
  const user = await requireUser()
  const parsed = z.object({ endpointId: id, event: z.enum(WEBHOOK_EVENTS) }).safeParse({ endpointId, event })
  if (!parsed.success) return null
  // A test makes our server call someone's URL; keep it to a sensible pace.
  if (!(await checkRateLimit(`webhook-test:${user.id}`, 20))) return { status: "rate" }
  const result = await sendTestEvent(user.id, parsed.data.endpointId, parsed.data.event)
  revalidatePath(PAGE)
  return result
}

export async function redeliverWebhook(deliveryId: unknown): Promise<AttemptResult | { status: "rate" } | null> {
  const user = await requireUser()
  const parsed = id.safeParse(deliveryId)
  if (!parsed.success) return null
  if (!(await checkRateLimit(`webhook-test:${user.id}`, 20))) return { status: "rate" }
  const result = await redeliver(user.id, parsed.data)
  revalidatePath(PAGE)
  return result
}

export async function createApiKeyAction(name: unknown): Promise<{ ok: true; key: string } | { ok: false; error: "limit" | "name" | "rate" }> {
  const user = await requireUser()
  if (!(await checkRateLimit(`api-key-create:${user.id}`, 10))) return { ok: false, error: "rate" }
  const created = await createApiKey(user.id, typeof name === "string" ? name : "")
  if (!created.ok) return created
  revalidatePath(PAGE)
  return { ok: true, key: created.key }
}

export async function revokeApiKeyAction(keyId: unknown): Promise<boolean> {
  const user = await requireUser()
  const parsed = id.safeParse(keyId)
  if (!parsed.success) return false
  const done = await revokeApiKey(user.id, parsed.data)
  if (done) revalidatePath(PAGE)
  return done
}
