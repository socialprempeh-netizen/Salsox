/**
 * Email-list helpers the browser needs (Quick Send, the request-a-signature
 * tool, the document editor), kept free of zod.
 *
 * Why this exists: these lived in schemas.ts, which imports zod for the
 * server's validation, so three client components shipped all of zod (about
 * 88 KB compressed) to check an address. The check is zod's own: its email
 * pattern, copied here and pinned to zod's by a test (email-list.test.ts),
 * so what the form accepts and what the server accepts cannot drift apart.
 * schemas.ts re-exports everything here, so server code is unchanged.
 */
import { MAX_RECIPIENTS_PER_DOCUMENT } from "./sending-limits"

/** Recipients per document; the server enforces the same number. */
export const MAX_RECIPIENTS = MAX_RECIPIENTS_PER_DOCUMENT

/** zod 4's default email pattern (z.email()); equality is asserted in the test. */
export const EMAIL_PATTERN = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/

/**
 * Splits what a person pastes into the Quick Send box ("a@x.com, b@y.com",
 * one per line, or "Ama <ama@x.com>") into unique, lower-cased addresses.
 * Returns the invalid fragments separately so the form can point at them.
 */
export function parseEmailList(input: string): { emails: { email: string; name?: string }[]; invalid: string[] } {
  const seen = new Set<string>()
  const emails: { email: string; name?: string }[] = []
  const invalid: string[] = []
  for (const raw of input.split(/[,;\n]+/)) {
    const part = raw.trim()
    if (!part) continue
    const angle = /^(.*)<([^>]+)>$/.exec(part)
    const email = (angle ? angle[2] : part).trim().toLowerCase()
    const name = angle?.[1].trim().replace(/^"|"$/g, "") || undefined
    // Was: if (!z.email().safeParse(email).success), the same pattern.
    if (!EMAIL_PATTERN.test(email)) {
      invalid.push(part)
      continue
    }
    if (seen.has(email)) continue
    seen.add(email)
    emails.push(name ? { email, name } : { email })
  }
  return { emails, invalid }
}

/** A readable fallback name from an address: "ama.mensah@x.com" → "Ama Mensah". */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || email
  )
}
