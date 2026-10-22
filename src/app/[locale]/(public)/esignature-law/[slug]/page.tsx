import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { setRequestLocale } from "next-intl/server"
import { getPages } from "@/lib/seo/pages"
import { sitePageMetadata } from "@/lib/seo/page-metadata"
import { findRegistryPage, noindexRobots } from "@/lib/seo-agent/published-pages"
import { SeoPageView } from "@/components/seo/seo-page-view"

/**
 * /esignature-law/{country}: what one country's law says about electronic
 * signatures, section by section (registry kind "compliance"). Written by
 * the SEO agent from facts verified against the statute
 * (src/lib/seo-agent/page-queue.ts) and published from the database; a file
 * in content/pages/compliance would be served the same way. Renders on its
 * first request and is cached until the agent revalidates it.
 */
export const dynamicParams = true

type Props = { params: Promise<{ locale: string; slug: string }> }

export function generateStaticParams() {
  return getPages({ kind: "compliance" }).map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findRegistryPage("compliance", (await params).slug)
  return found ? { ...sitePageMetadata(found.page), ...noindexRobots(found.noindex) } : {}
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const found = await findRegistryPage("compliance", slug)
  if (!found) notFound()
  return <SeoPageView page={found.page} />
}
