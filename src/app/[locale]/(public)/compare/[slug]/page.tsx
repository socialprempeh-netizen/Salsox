import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { setRequestLocale } from "next-intl/server"
import { getPage, getPages } from "@/lib/seo/pages"
import { sitePageMetadata } from "@/lib/seo/page-metadata"
import { SeoPageView } from "@/components/seo/seo-page-view"

/**
 * /compare/{slug}: the "comparison" pages from content/pages (src/lib/seo/pages.ts).
 * Static, generated at build; an unknown slug is a 404.
 */
export const dynamicParams = false

type Props = { params: Promise<{ locale: string; slug: string }> }

export function generateStaticParams() {
  return getPages({ kind: "comparison" }).map((p) => ({ slug: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = getPage("comparison", (await params).slug)
  return page ? sitePageMetadata(page) : {}
}

export default async function Page({ params }: Props) {
  const { locale, slug } = await params
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale(locale)
  const page = getPage("comparison", slug)
  if (!page) notFound()
  return <SeoPageView page={page} />
}
