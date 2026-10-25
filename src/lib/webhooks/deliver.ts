/**
 * Sends one webhook over HTTP, safely. Server only.
 *
 * - Every connection resolves the host itself and refuses a private,
 *   loopback or link-local address (url-safety.ts) at connect time, so a
 *   public name pointed at an internal address cannot be used to reach in,
 *   even if its DNS changes between the URL check and the request.
 *   (Loopback is allowed in development only, to try the feature locally.)
 * - Redirects are not followed: a 3xx is a failed delivery, since following
 *   it would send the payload, and our server, wherever it pointed.
 * - Ten seconds for an answer; the response body is never read or stored.
 *
 * Headers: Content-Type, User-Agent, Webhook-Id (the event id, the same on
 * every retry), Webhook-Event, Webhook-Timestamp and Webhook-Signature
 * (payload.ts describes how a receiver checks it).
 */
import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import { Agent, fetch } from "undici"
import { siteConfig } from "@/config/site"
import { signatureHeader } from "./payload"
import { isPrivateAddress } from "./url-safety"

const TIMEOUT_MS = 10_000
const allowLoopback = () => process.env.NODE_ENV === "development"

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void

/** dns.lookup, refusing any answer that points inside a private network. */
function safeLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "")
    const list = addresses as LookupAddress[]
    const blocked = list.find((a) => isPrivateAddress(a.address) && !(allowLoopback() && (a.address === "127.0.0.1" || a.address === "::1")))
    if (blocked || list.length === 0) {
      const refusal = Object.assign(new Error(`refused: ${hostname} resolves to a private address`), { code: "EPRIVATE" })
      return callback(refusal, "")
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

const agent = new Agent({ connect: { lookup: safeLookup as never, timeout: TIMEOUT_MS }, headersTimeout: TIMEOUT_MS, bodyTimeout: TIMEOUT_MS })

export type SendResult = { ok: boolean; status: number | null; error: string | null; ms: number }

export async function sendWebhook(input: { url: string; secret: string; eventId: string; event: string; body: string; now?: Date }): Promise<SendResult> {
  const now = input.now ?? new Date()
  const started = Date.now()
  try {
    const res = await fetch(input.url, {
      method: "POST",
      dispatcher: agent,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "content-type": "application/json",
        "user-agent": `${siteConfig.name.replace(/[^\w.-]+/g, "")}-Webhooks/1.0`,
        "webhook-id": input.eventId,
        "webhook-event": input.event,
        "webhook-timestamp": String(Math.floor(now.getTime() / 1000)),
        "webhook-signature": signatureHeader(input.secret, input.body, now),
      },
      body: input.body,
    })
    // The body is not ours to keep; drain it so the socket is freed.
    await res.body?.cancel().catch(() => {})
    const ok = res.status >= 200 && res.status < 300
    const error = ok ? null : res.status >= 300 && res.status < 400 ? `redirect to ${res.headers.get("location") ?? "elsewhere"} not followed` : `answered ${res.status}`
    return { ok, status: res.status, error, ms: Date.now() - started }
  } catch (err) {
    const e = err as { name?: string; message?: string; cause?: { code?: string; message?: string } }
    const reason = e.name === "TimeoutError" || e.name === "AbortError" ? "no answer within 10 seconds" : e.cause?.message ?? e.message ?? "could not connect"
    return { ok: false, status: null, error: reason.slice(0, 300), ms: Date.now() - started }
  }
}
