/**
 * This app's OutreachAdapter (agent.ts): the product facts the emails may
 * use, who they are from, the footer, the unsubscribe link and where "Add to
 * Customers" puts a lead. The rest of src/lib/outreach-agent is written
 * against the adapter type and knows nothing about the app, so moving the
 * engine to its own product means writing another one of these.
 *
 * Settings (names only; values are never shown anywhere):
 *  - OUTREACH_EMAIL_FROM: the sender, on a domain separate from EMAIL_FROM,
 *    e.g. "Ama at Salsox <ama@hello.salsox.com>";
 *  - OUTREACH_SENDER_NAME, OUTREACH_SENDER_ROLE: the sign-off;
 *  - OUTREACH_POSTAL_ADDRESS: the address every email's footer carries;
 *  - OUTREACH_TOOL_NAME, OUTREACH_TOOL_URL: what the optional "sent via" line
 *    names, for a standalone release (the line itself is off by default).
 *
 * "Add to Customers" makes a row in the Outreach tracker (/admin/outreach),
 * the conversation list, marked Replied. It never creates an account: a lead
 * becomes a customer by signing up, like anyone else.
 */
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { siteConfig } from "@/config/site"
import { routing } from "@/i18n/routing"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import { OUTREACH_LIMITS, fromDay, toDay } from "@/lib/outreach"
import { prisma } from "@/lib/prisma"
import { productSummary } from "@/lib/product-summary"
import type { OutreachAdapter } from "./agent"
import type { Fix } from "./fixes"
import { trackerNote } from "./tracker"

/**
 * What the product does about each complaint, in facts taken from the
 * product summary (src/lib/product-summary.ts) and the plan limits. An email
 * may state these and nothing else; change a fact here and every email after
 * it changes with it.
 */
export const SALSOX_FIXES: Fix[] = [
  { id: "no-signer-accounts", answers: ["signer-friction"], label: "No signer accounts", facts: "Signers do not need an account or an app. They open the link and sign in their browser, one field at a time." },
  { id: "unlimited-documents", answers: ["pricing", "limits"], label: "Unlimited documents", facts: `Paid plans send unlimited documents, with no per-envelope limit. A free account sends ${FREE_DOCUMENTS_PER_MONTH} documents a month.` },
  { id: "built-for-phones", answers: ["mobile"], label: "Built for phones", facts: "It is built for phones: documents go out by email, WhatsApp or SMS, and signers fill one field at a time in their phone's browser." },
  { id: "sign-and-pay", answers: ["payments"], label: "Sign & Pay", facts: "Sign & Pay collects a payment as part of signing, by card or mobile money, through Stripe or Paystack." },
  { id: "three-step-sending", answers: ["complexity"], label: "Three-step sending", facts: "Sending is three steps: upload any PDF, choose who signs, and send." },
  { id: "signing-order", answers: ["signing-order"], label: "Signing order", facts: "Documents can go to several signers in a set order." },
  { id: "audit-certificate", answers: ["audit-trail"], label: "Audit certificate", facts: "Every finished document is a sealed PDF with an audit certificate." },
]

/** The crawler's name: the product name as one token, then a link to the site. */
function userAgent(): string {
  const token = siteConfig.name.replace(/[^A-Za-z0-9]/g, "") || "Outreach"
  return `${token}OutreachBot/1.0 (+${siteConfig.url})`
}

export const salsoxOutreach: OutreachAdapter = {
  name: siteConfig.name,
  url: siteConfig.url,
  productSummary: productSummary(),
  fixes: SALSOX_FIXES,
  sender: { name: process.env.OUTREACH_SENDER_NAME?.trim() || undefined, role: process.env.OUTREACH_SENDER_ROLE?.trim() || undefined },
  userAgent: userAgent(),
  postalAddress: process.env.OUTREACH_POSTAL_ADDRESS?.trim() || undefined,
  mainEmailFrom: process.env.EMAIL_FROM?.trim() || undefined,
  tool: { name: process.env.OUTREACH_TOOL_NAME?.trim() || undefined, url: process.env.OUTREACH_TOOL_URL?.trim() || undefined },

  async footer(unsubscribeUrl) {
    // Explicit locale: sent from a cron or a button, never from the recipient's browser.
    const t = await getTranslations({ locale: routing.defaultLocale, namespace: "outreachEmail" })
    return [t("why", { site: siteConfig.name }), t("unsubscribe", { url: unsubscribeUrl }), process.env.OUTREACH_POSTAL_ADDRESS?.trim() ?? ""].filter(Boolean)
  },

  unsubscribeUrl(token) {
    return `${siteConfig.url.replace(/\/$/, "")}/api/outreach/unsubscribe?t=${encodeURIComponent(token)}`
  },

  async addToTracker(entry) {
    const today = toDay(new Date())
    const row = await prisma.outreachContact.create({
      data: {
        name: entry.name.slice(0, OUTREACH_LIMITS.name),
        company: entry.company?.slice(0, OUTREACH_LIMITS.company) ?? null,
        channel: entry.source === "reddit" ? "REDDIT" : "EMAIL",
        contactedAt: fromDay(today)!,
        status: "REPLIED",
        notes: trackerNote(entry, OUTREACH_LIMITS.notes),
      },
    })
    revalidatePath("/admin/outreach")
    return row.id
  },

  revalidate(paths) {
    for (const path of paths) revalidatePath(path)
  },
}
