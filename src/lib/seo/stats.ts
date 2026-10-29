/**
 * The figures an industry page's stats bar may show, and where each comes
 * from. The bar follows the pattern of the large e-signature sites' industry
 * pages (a row of big numbers under the hero), but those sites show customer
 * outcomes ("87% faster"); this product has no such measured outcomes, so
 * every figure here is a fact about the product itself, read from the
 * constant that enforces it wherever one exists. A page lists stat ids, never
 * numbers, so a generated page cannot state a figure nobody checked.
 *
 * Labels live in src/locales/en.json under seoPages.stats.<id>.
 */
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"

export const STAT_IDS = ["freeDocuments", "signerAccounts", "sendChannels", "payAtSigning"] as const
export type StatId = (typeof STAT_IDS)[number]

/**
 * The value shown for each stat. sendChannels counts email, WhatsApp and SMS
 * (src/lib/esign/share.ts builds the three); payAtSigning counts card and
 * mobile money, the two ways Sign & Pay takes payment.
 */
export function statValue(id: StatId): string {
  switch (id) {
    case "freeDocuments":
      return String(FREE_DOCUMENTS_PER_MONTH)
    case "signerAccounts":
      return "0"
    case "sendChannels":
      return "3"
    case "payAtSigning":
      return "2"
  }
}
