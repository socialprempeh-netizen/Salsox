import { getTranslations } from "next-intl/server"
import { getPages } from "@/lib/seo/pages"
import { findRegistryPage } from "@/lib/seo-agent/published-pages"
import { OG_SIZE, ogCard } from "@/components/seo/og-card"

/** The social card for an e-signature law page (see og-card.tsx). */
export const size = OG_SIZE
export const contentType = "image/png"
export const alt = "Preview card showing the page title and the site name"

export function generateStaticParams() {
  return getPages({ kind: "compliance" }).map((p) => ({ slug: p.slug }))
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const t = await getTranslations({ locale: "en", namespace: "seoPages.eyebrow" })
  return ogCard({ eyebrow: t("compliance"), title: (await findRegistryPage("compliance", slug))?.page.h1 ?? "" })
}
