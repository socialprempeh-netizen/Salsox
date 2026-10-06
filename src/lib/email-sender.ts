/**
 * Whether EMAIL_FROM is a sender real recipients will ever receive mail from.
 *
 * Two configurations send nothing to anyone but you, while Resend accepts
 * every request and the app says "Sent":
 *
 * - Resend's shared test sender, `onboarding@resend.dev`, which only delivers
 *   to the address that owns the Resend account. Signing invitations to
 *   anyone else go nowhere. This is the setup Resend's quick start uses, which
 *   is why it ends up in production.
 * - The placeholder from .env.example (`hello@yourdomain.com`) or any
 *   example.com address, whose domain is not verified in Resend, so every
 *   send is refused.
 *
 * Mail from a domain without SPF, DKIM and DMARC lands in spam or is dropped
 * silently; that is configured in DNS and checked in Resend's dashboard
 * (Domains), not something the app can test from here (docs/deployment.md).
 *
 * Checked at boot in production (src/lib/env.ts), so a deployment cannot
 * start with a sender that cannot reach recipients.
 */

/** The address inside "Name <address>" or a bare address, lower-cased. */
export function senderAddress(from: string): string | null {
  const match = /<([^<>\s]+@[^<>\s]+)>\s*$/.exec(from.trim()) ?? /^([^\s<>]+@[^\s<>]+)$/.exec(from.trim())
  return match ? match[1].toLowerCase() : null
}

export type SenderProblem = "unparseable" | "placeholder" | "resendTestSender"

export function senderAddressProblem(from: string | undefined | null): SenderProblem | null {
  if (!from?.trim()) return null
  const address = senderAddress(from)
  if (!address) return "unparseable"
  const domain = address.split("@")[1]
  if (domain === "resend.dev") return "resendTestSender"
  if (domain === "yourdomain.com" || domain === "example.com" || domain.endsWith(".example.com") || domain === "example.org") return "placeholder"
  return null
}

export const SENDER_PROBLEM_MESSAGES: Record<SenderProblem, string> = {
  unparseable: 'EMAIL_FROM should be "Name <you@yourdomain>" or an address',
  placeholder: "EMAIL_FROM is still the placeholder: use an address on a domain you verified in Resend, or every email is refused",
  resendTestSender:
    "EMAIL_FROM uses Resend's test sender (resend.dev), which only delivers to the Resend account owner: signing invitations to anyone else are never received. Verify your own domain in Resend and send from it",
}
