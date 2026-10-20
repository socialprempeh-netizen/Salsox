import { siteConfig } from "@/config/site"
import { isKitSite } from "@/config/kit"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"

/**
 * One paragraph saying what the product is and does, in plain language.
 *
 * Moved here from the /llms.txt route so the SEO agent (src/lib/seo-agent)
 * can hand the same paragraph to its writer as the only product facts an
 * article may state: what an assistant is told about the product and what an
 * article claims about it come from one source and cannot disagree.
 */
export function productSummary(): string {
  return isKitSite
    ? `${siteConfig.name} is an open-source, production-ready SaaS starter kit. It ships with authentication, Stripe billing, a Postgres database via Prisma, a file-based blog and docs, transactional email and a full dashboard, so you can launch a real product without wiring the plumbing yourself.`
    : // Was the kit's placeholder ("${siteConfig.name} is a SaaS product... Replace
      // this paragraph with a short description of what you do"), served
      // as-is to every assistant that read /llms.txt.
      `${siteConfig.name} is an e-signature service built for phones. Senders upload any PDF, choose who signs, and send it by email, WhatsApp or SMS; signers need no account or app and sign one field at a time in their browser. Documents can collect a payment as part of signing (Sign & Pay, by card or mobile money through Stripe or Paystack), go to signers in a set order, and finish as a sealed PDF with an audit certificate. Free accounts send ${FREE_DOCUMENTS_PER_MONTH} documents a month; paid plans send unlimited documents.`
}
