/**
 * Transactional emails for the signing flow, sent through the kit's Resend
 * setup and wrapped in its shared template (src/lib/email.ts).
 *
 * Email is one delivery channel among several: every signing link can also be
 * copied or shared over WhatsApp/SMS from the dashboard. So a missing Resend
 * key is not an error here. In development the link is logged instead, which
 * is enough to walk through the whole flow locally.
 *
 * Every value that came from a user (names, titles, messages) is escaped.
 */
import { Resend } from "resend"
import { getTranslations } from "next-intl/server"
import { routing } from "@/i18n/routing"
import { siteConfig } from "@/config/site"
import { baseTemplate, escapeHtml } from "@/lib/email"
import { deliver } from "@/lib/email-delivery"

function esignEmailStrings() {
  return getTranslations({ locale: routing.defaultLocale, namespace: "esignEmail" })
}

// `||`, not `??`: .env.example ships EMAIL_FROM="", and an empty sender must
// fall back rather than be sent to Resend as "from: ''".
const FROM_ADDRESS = process.env.EMAIL_FROM || `${siteConfig.name} <${siteConfig.contactEmail}>`

/**
 * Bold, for values dropped into a message. The markup lives here rather than
 * in the message file because next-intl reads tags in a message as rich-text
 * placeholders and refuses to format a plain string that contains them.
 */
const bold = (value: string) => `<strong>${value}</strong>`

/**
 * What happened to one email.
 *
 *   sent           the provider accepted it
 *   notConfigured  there is no provider on this deployment (no Resend key):
 *                  nothing was attempted, and links are shared by hand
 *   failed         a provider is configured and refused it, or could not be
 *                  reached
 *
 * This used to be a boolean, false for both of the last two, and every caller
 * ignored it: the dashboard said "Sent" whatever the provider answered. All
 * three are kept apart: only `failed` is something to retry, and only `sent`
 * may be shown as "Sent". `notConfigured` is neither: nothing went out, and
 * the sender is told to share the link by hand.
 */
export type EmailOutcome = "sent" | "notConfigured" | "failed"

/**
 * True unless a configured provider failed to take the email. Answers "is
 * there an error to report?", not "did an email go out?": that is `emailed`.
 * It used to decide both, so with no provider configured the dashboard
 * stamped every recipient "Sent" and said "Each recipient got an email".
 */
export function delivered(outcome: EmailOutcome): boolean {
  return outcome !== "failed"
}

/** True only when the provider accepted the email: the one case shown as "Sent". */
export function emailed(outcome: EmailOutcome): boolean {
  return outcome === "sent"
}

/** Whether this deployment has an email provider at all. */
export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY)
}

async function send(kind: string, to: string, subject: string, html: string, devLink?: string): Promise<EmailOutcome> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    // Not an error: see the note at the top of this file.
    console.info(`[esign email] ${kind} → ${to}: ${subject}${devLink ? `\n  ${devLink}` : ""}`)
    return "notConfigured"
  }
  const resend = new Resend(key)
  try {
    let id: string | undefined
    const accepted = await deliver(kind, async () => {
      const result = await resend.emails.send({ from: FROM_ADDRESS, to, subject, html })
      id = result.data?.id
      return result
    })
    // Resend's message id, never the address: it is what to search for in
    // Resend's dashboard (Emails) to see whether this invitation was
    // delivered, bounced or marked as spam. "Accepted" here only means
    // Resend took it; delivery is decided after.
    if (accepted) console.info(`[esign email] ${kind} accepted by Resend: ${id ?? "no id"}`)
    return accepted ? "sent" : "failed"
  } catch (error) {
    // A failed email must never fail the signing action that triggered it:
    // the link is still shareable from the dashboard. It is reported to the
    // caller, which decides what to tell the sender.
    console.error(`[esign email] ${kind} failed`, error)
    return "failed"
  }
}

export async function sendSigningInvite(args: {
  to: string
  recipientName: string
  senderName: string
  title: string
  message?: string | null
  url: string
  expiresAt?: Date | null
  reminder?: boolean
  amountLabel?: string | null
}): Promise<EmailOutcome> {
  const t = await esignEmailStrings()
  const title = escapeHtml(args.title)
  const subject = args.reminder
    ? t("reminderSubject", { title: args.title })
    : t("inviteSubject", { sender: args.senderName, title: args.title })
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.recipientName) })}</p>
    <p>${t("inviteIntro", { sender: escapeHtml(args.senderName), title: bold(title) })}</p>
    ${args.message ? `<div class="highlight"><p>${escapeHtml(args.message).replace(/\n/g, "<br>")}</p></div>` : ""}
    ${args.amountLabel ? `<p>${t("invitePayment", { amount: bold(escapeHtml(args.amountLabel)) })}</p>` : ""}
    <a href="${args.url}" class="btn">${t("inviteCta")}</a>
    <p style="margin-top:24px">${t("inviteMobile")}</p>
    ${args.expiresAt ? `<p>${t("inviteExpires", { date: args.expiresAt.toUTCString() })}</p>` : ""}
  `)
  return send(args.reminder ? "esign-reminder" : "esign-invite", args.to, subject, html, args.url)
}

export async function sendDocumentCompleted(args: {
  to: string
  name: string
  title: string
  downloadUrl: string
  /** Whether the sealed copy has the certificate page (a Business feature). */
  withCertificate?: boolean
}): Promise<EmailOutcome> {
  const t = await esignEmailStrings()
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.name) })}</p>
    <p>${t(args.withCertificate === false ? "completedIntroPlain" : "completedIntro", { title: bold(escapeHtml(args.title)) })}</p>
    <a href="${args.downloadUrl}" class="btn">${t("completedCta")}</a>
  `)
  return send("esign-completed", args.to, t("completedSubject", { title: args.title }), html, args.downloadUrl)
}

/**
 * A Sign & Pay payment was given back automatically: it arrived after the
 * document was cancelled, expired or declined, or it duplicated one already
 * made. The sender is told why the money will not reach them; the payer that
 * it is on its way back.
 */
export async function sendPaymentRefunded(args: {
  to: string
  name: string
  title: string
  amountLabel: string
  reason: "documentClosed" | "duplicate"
  audience: "owner" | "payer"
  url: string
}): Promise<EmailOutcome> {
  const t = await esignEmailStrings()
  const owner = args.audience === "owner"
  const duplicate = args.reason === "duplicate"
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.name) })}</p>
    <p>${t(owner && duplicate ? "refundOwnerDuplicate" : owner ? "refundOwnerClosed" : duplicate ? "refundPayerDuplicate" : "refundPayerClosed", { title: bold(escapeHtml(args.title)), amount: bold(escapeHtml(args.amountLabel)) })}</p>
    <p>${t("refundTiming")}</p>
    <a href="${args.url}" class="btn">${t("refundCta")}</a>
  `)
  return send("esign-refund", args.to, t("refundSubject", { title: args.title }), html, args.url)
}

/**
 * The payer's bank opened a dispute (chargeback) on a Sign & Pay payment.
 * Only the sender is told: evidence comes from them, and the deadline to
 * respond is short.
 */
export async function sendPaymentDisputed(args: {
  to: string
  name: string
  title: string
  amountLabel: string
  url: string
}): Promise<EmailOutcome> {
  const t = await esignEmailStrings()
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.name) })}</p>
    <p>${t("disputeIntro", { title: bold(escapeHtml(args.title)), amount: bold(escapeHtml(args.amountLabel)) })}</p>
    <p>${t("disputeNext")}</p>
    <a href="${args.url}" class="btn">${t("disputeCta")}</a>
  `)
  return send("esign-dispute", args.to, t("disputeSubject", { title: args.title }), html, args.url)
}

export async function sendDocumentRejected(args: {
  to: string
  ownerName: string
  signerName: string
  title: string
  reason?: string | null
  url: string
}): Promise<EmailOutcome> {
  const t = await esignEmailStrings()
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.ownerName) })}</p>
    <p>${t("rejectedIntro", { name: escapeHtml(args.signerName), title: bold(escapeHtml(args.title)) })}</p>
    ${args.reason ? `<div class="highlight"><p>${escapeHtml(args.reason)}</p></div>` : ""}
    <a href="${args.url}" class="btn">${t("openDocumentCta")}</a>
  `)
  return send("esign-rejected", args.to, t("rejectedSubject", { name: args.signerName, title: args.title }), html)
}

export async function sendDocumentExpired(args: { to: string; ownerName: string; title: string; url: string }) {
  const t = await esignEmailStrings()
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.ownerName) })}</p>
    <p>${t("expiredIntro", { title: bold(escapeHtml(args.title)) })}</p>
    <a href="${args.url}" class="btn">${t("expiredCta")}</a>
  `)
  return send("esign-expired", args.to, t("expiredSubject", { title: args.title }), html, args.url)
}

/** Sent ahead of every renewal: Salsox never renews a subscription silently. */
export async function sendRenewalNotice(args: {
  to: string
  name: string
  plan: string
  date: string
  amount: string
  manageUrl: string
}): Promise<EmailOutcome> {
  const t = await esignEmailStrings()
  const html = baseTemplate(`
    <p>${t("hello", { name: escapeHtml(args.name) })}</p>
    <p>${t("renewalIntro", { plan: bold(escapeHtml(args.plan)), date: bold(args.date), amount: bold(args.amount) })}</p>
    <p>${t("renewalCancel")}</p>
    <a href="${args.manageUrl}" class="btn">${t("renewalCta")}</a>
  `)
  return send("esign-renewal-notice", args.to, t("renewalSubject", { plan: args.plan, date: args.date }), html)
}
