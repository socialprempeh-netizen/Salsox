import { getTranslations } from "next-intl/server"
import { getPages } from "@/lib/seo/pages"
import { OG_SIZE, ogCard } from "@/components/seo/og-card"

/** The social card for a root-level landing or tool page (see og-card.tsx). */
export const size = OG_SIZE
export const contentType = "image/png"
export const alt = "Preview card showing the page title and the site name"

export function generateStaticParams() {
  return [...getPages({ kind: "solution" }), ...getPages({ kind: "tool" })].map((p) => ({ page: p.slug }))
}

export default async function Image({ params }: { params: Promise<{ page: string }> }) {
  const { page: slug } = await params
  const t = await getTranslations({ locale: "en", namespace: "seoPages.eyebrow" })
  const page = [...getPages({ kind: "solution" }), ...getPages({ kind: "tool" })].find((p) => p.slug === slug)
  return ogCard({ eyebrow: page?.kind === "tool" ? t("tool") : t("solution"), title: page?.h1 ?? "" })
}
