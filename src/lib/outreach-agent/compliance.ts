/**
 * What every outreach email must carry and where it may be sent from, as
 * pure functions:
 *
 *  - a separate sending domain: OUTREACH_EMAIL_FROM must not share a domain
 *    with the product's own EMAIL_FROM, so a cold campaign's complaints can
 *    never hurt the deliverability of sign-in links and signing invitations;
 *  - an unsubscribe link (signed, so nobody can unsubscribe someone else) and
 *    the sender's postal address in the footer, which CAN-SPAM and the UK and
 *    EU rules on B2B email expect;
 *  - the optional "sent via" line for when the engine is sold on its own,
 *    built in but off unless the setting is switched on.
 *
 * The unsubscribe secret is derived from CRON_SECRET (or set explicitly as
 * OUTREACH_UNSUBSCRIBE_SECRET), the same way the IndexNow key is: no new
 * secret to manage, never shown.
 */
import { createHmac, timingSafeEqual } from "node:crypto"

/** The domain of an address, from "Name <a@b.com>" or "a@b.com"; null when there is none. */
export function domainOf(from: string | undefined | null): string | null {
  if (!from) return null
  const address = /<([^>]+)>/.exec(from)?.[1] ?? from
  const at = address.trim().toLowerCase().split("@")
  return at.length === 2 && at[1].includes(".") ? at[1] : null
}

/** Why the outreach sender cannot be used, or null when it can. */
export function sendingDomainProblem(outreachFrom: string | undefined, mainFrom: string | undefined): "missing" | "sameDomain" | null {
  const outreach = domainOf(outreachFrom)
  if (!outreach) return "missing"
  const main = domainOf(mainFrom)
  if (main && main === outreach) return "sameDomain"
  return null
}

/**
 * The subdomain the setup guidance suggests for outreach: "hello." on the
 * product's own email domain (EMAIL_FROM), so the example matches the
 * deployment without naming any brand here. Null when EMAIL_FROM is unset.
 */
export function suggestedSendingDomain(mainFrom: string | undefined): string | null {
  const main = domainOf(mainFrom)
  return main ? `hello.${main}` : null
}

/**
 * Where replies to outreach go: OUTREACH_REPLY_TO when set (it may be the
 * main inbox on the product's own domain: receiving mail there does not
 * touch sending reputation), else the sender. "invalid" when it is set but is
 * not an address. `inbound` says whether replies land on the outreach domain,
 * where the inbound webhook can label them; otherwise they are logged by hand.
 */
export function replyRoute(replyTo: string | undefined, outreachFrom: string | undefined): { address: string; inbound: boolean } | "invalid" | null {
  const set = replyTo?.trim()
  if (set && !domainOf(set)) return "invalid"
  const address = set || outreachFrom?.trim()
  if (!address) return null
  return { address: (/<([^>]+)>/.exec(address)?.[1] ?? address).trim(), inbound: domainOf(address) === domainOf(outreachFrom) }
}

export function unsubscribeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const explicit = env.OUTREACH_UNSUBSCRIBE_SECRET?.trim()
  if (explicit) return explicit
  const cron = env.CRON_SECRET?.trim()
  return cron ? createHmac("sha256", cron).update("outreach-unsubscribe").digest("hex") : null
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64url")

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}

function signature(email: string, secret: string): string {
  return createHmac("sha256", secret).update(normaliseEmail(email)).digest("base64url").slice(0, 32)
}

/** A token that names one address and cannot be forged without the secret. */
export function unsubscribeToken(email: string, secret: string): string {
  return `${b64(normaliseEmail(email))}.${signature(email, secret)}`
}

/** The address a token names, or null when it was not made with this secret. */
export function readUnsubscribeToken(token: string, secret: string): string | null {
  const [payload, sig] = token.split(".")
  if (!payload || !sig) return null
  let email: string
  try {
    email = Buffer.from(payload, "base64url").toString("utf8")
  } catch {
    return null
  }
  if (!email.includes("@")) return null
  const expected = Buffer.from(signature(email, secret))
  const given = Buffer.from(sig)
  return expected.length === given.length && timingSafeEqual(expected, given) ? normaliseEmail(email) : null
}

/** The "sent via" line, or null while it is switched off or has no tool to name. */
export function sentViaLine({ enabled, tool, url }: { enabled: boolean; tool: string | undefined; url?: string }): string | null {
  if (!enabled || !tool?.trim()) return null
  return url?.trim() ? `Sent via ${tool.trim()} (${url.trim()})` : `Sent via ${tool.trim()}`
}

/** The finished plain-text email: body, optional sent-via line, then the footer. */
export function composeEmail({ body, sentVia, footer }: { body: string; sentVia: string | null; footer: string[] }): string {
  return [body.trim(), ...(sentVia ? ["", sentVia] : []), "", "--", ...footer].join("\n")
}
