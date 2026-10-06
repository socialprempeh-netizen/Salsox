import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { pageMetadata } from "@/lib/metadata"
import { HubPage } from "@/components/seo/hub-page"
import { siteConfig } from "@/config/site"

/** The /esignature-for hub: every registry page of its kind, one click away (hub-page.tsx). */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seoPages.hubs.useCases")
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription", { site: siteConfig.name }), path: "/esignature-for" })
}

export default async function Hub({ params }: { params: Promise<{ locale: string }> }) {
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale((await params).locale)
  return <HubPage hub="useCases" kinds={["use-case"]} path="/esignature-for" />
}
