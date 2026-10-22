import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { setRequestLocale } from "next-intl/server"
import { getPages } from "@/lib/seo/pages"
import { sitePageMetadata } from "@/lib/seo/page-metadata"
import { findRegistryPage, noindexRobots } from "@/lib/seo-agent/published-pages"
import { SeoPageView } from "@/components/seo/seo-page-view"

/**
 * /alternatives/{slug}: the "alternative" pages from content/pages (src/lib/seo/pages.ts),
 * and those the SEO agent wrote and published (src/lib/seo-agent).
 * The files are generated at build; a published agent page renders on its
 * first request and is cached until the agent revalidates it. An unknown
 * slug is a 404.
 */
// Was false (every page a file, all known at build). The agent publishes
// pages after the build, so an unlisted slug is looked up instead of 404ing.
// export const dynamicParams = false
export const dynamicParams = true

type Props = { params: Promise<{ locale: string; slug: string }> }

export function generateStaticParams() {
  return getPages({ kind: "alternative" }).map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await findRegistryPage("alternative", (await params).slug)
  return found ? { ...sitePageMetadata(found.page), ...noindexRobots(found.noindex) } : {}
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale(locale)
  const found = await findRegistryPage("alternative", slug)
  if (!found) notFound()
  return <SeoPageView page={found.page} />
}
