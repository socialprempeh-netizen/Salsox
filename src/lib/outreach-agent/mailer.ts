/**
 * The outreach agent's email in and out, through Resend, on its own sender.
 *
 * Out: OUTREACH_EMAIL_FROM, an address on a domain separate from the
 * product's EMAIL_FROM (compliance.ts refuses the same domain), so a cold
 * campaign can never damage the reputation the sign-in and signing emails
 * depend on. Verify that domain in Resend before sending. Each email is plain
 * text, with List-Unsubscribe and one-click unsubscribe headers (RFC 8058), and
 * replies go to OUTREACH_REPLY_TO when set, else to the sender.
 *
 * In: Resend's inbound email on the same domain posts `email.received` to
 * /api/webhooks/outreach-inbound, signed with OUTREACH_INBOUND_WEBHOOK_SECRET;
 * the body is then fetched by id. Uses the account's RESEND_API_KEY, never
 * logged or returned in an error.
 */
import { Resend } from "resend"
import { latestReplyText, textFromHtml } from "./inbound"

let instance: Resend | null = null

function resend(): Resend {
  if (!instance) {
    const key = process.env.RESEND_API_KEY?.trim()
    if (!key) throw new Error("RESEND_API_KEY is not set")
    instance = new Resend(key)
  }
  return instance
}

export function outreachFrom(env: Record<string, string | undefined> = process.env): string | undefined {
  return env.OUTREACH_EMAIL_FROM?.trim() || undefined
}

export async function sendOutreachEmail({ to, subject, text, unsubscribeUrl }: { to: string; subject: string; text: string; unsubscribeUrl: string }): Promise<{ id: string }> {
  const from = outreachFrom()
  if (!from) throw new Error("OUTREACH_EMAIL_FROM is not set")
  const replyTo = process.env.OUTREACH_REPLY_TO?.trim()
  const { data, error } = await resend().emails.send({
    from,
    to,
    subject,
    text,
    ...(replyTo ? { replyTo } : {}),
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "stream", value: "outreach" }],
  })
  if (error || !data) throw new Error(`Resend did not accept the email${error?.message ? `: ${error.message.slice(0, 200)}` : ""}`)
  return { id: data.id }
}

export type InboundEmail = { id: string; from: string; to: string[]; subject: string; text: string }

/** A received email by its Resend id, with only the new part of the reply as text. */
export async function getInboundEmail(id: string): Promise<InboundEmail> {
  const { data, error } = await resend().emails.receiving.get(id)
  if (error || !data) throw new Error(`Resend could not return the received email${error?.message ? `: ${error.message.slice(0, 200)}` : ""}`)
  const raw = data.text?.trim() ? data.text : data.html ? textFromHtml(data.html) : ""
  return { id: data.id, from: data.from, to: data.to, subject: data.subject ?? "", text: latestReplyText(raw) }
}

export function inboundConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.OUTREACH_INBOUND_WEBHOOK_SECRET?.trim())
}

/** The verified event from a webhook call, or null when the signature does not check out. */
export function verifyInbound(payload: string, headers: { id: string | null; timestamp: string | null; signature: string | null }): { type: string; data: Record<string, unknown> } | null {
  const secret = process.env.OUTREACH_INBOUND_WEBHOOK_SECRET?.trim()
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return null
  try {
    const event = resend().webhooks.verify({ payload, headers: { id: headers.id, timestamp: headers.timestamp, signature: headers.signature }, webhookSecret: secret })
    return event as unknown as { type: string; data: Record<string, unknown> }
  } catch {
    return null
  }
}
