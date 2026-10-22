/**
 * Names and one-line descriptions for the fixed routes that SEO pages link
 * to (pricing, the hubs, verification), read from the message file so link
 * cards are translated like everything else. Used with resolveLinks in
 * src/lib/seo/links.ts.
 */
import { getTranslations } from "next-intl/server"
import type { FixedLabels } from "@/lib/seo/links"
import { siteConfig } from "@/config/site"

// templates and law joined with the SEO agent's page mode, whose template,
// comparison and law pages link to those hubs.
// Was: { pricing, verify, blog, tools, compare, useCases, docs }
const FIXED = { pricing: "/pricing", verify: "/verify", blog: "/blog", tools: "/tools", compare: "/compare", useCases: "/esignature-for", docs: "/resources/help", templates: "/templates", law: "/esignature-law" } as const
// docs was "/docs", which now redirects to the Help Center.

export async function fixedLinkLabels(): Promise<FixedLabels> {
  const t = await getTranslations("seoPages.fixedLinks")
  return Object.fromEntries(
    Object.entries(FIXED).map(([key, href]) => [href, { name: t(`${key}.name`), description: t(`${key}.description`, { site: siteConfig.name }) }])
  )
}
