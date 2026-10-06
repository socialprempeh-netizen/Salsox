/**
 * Names and one-line descriptions for the fixed routes that SEO pages link
 * to (pricing, the hubs, verification), read from the message file so link
 * cards are translated like everything else. Used with resolveLinks in
 * src/lib/seo/links.ts.
 */
import { getTranslations } from "next-intl/server"
import type { FixedLabels } from "@/lib/seo/links"
import { siteConfig } from "@/config/site"

const FIXED = { pricing: "/pricing", verify: "/verify", blog: "/blog", tools: "/tools", compare: "/compare", useCases: "/esignature-for", docs: "/docs" } as const

export async function fixedLinkLabels(): Promise<FixedLabels> {
  const t = await getTranslations("seoPages.fixedLinks")
  return Object.fromEntries(
    Object.entries(FIXED).map(([key, href]) => [href, { name: t(`${key}.name`), description: t(`${key}.description`, { site: siteConfig.name }) }])
  )
}
