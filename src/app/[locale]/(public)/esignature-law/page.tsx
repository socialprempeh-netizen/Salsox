import type { Metadata } from "next"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { pageMetadata } from "@/lib/metadata"
import { getAllPosts } from "@/lib/blog"
import { HubPage } from "@/components/seo/hub-page"
import { registryPages, noindexRobots } from "@/lib/seo-agent/published-pages"
import { siteConfig } from "@/config/site"

/**
 * The /esignature-law hub: one page per country on what its law says about
 * signing electronically (registry kind "compliance", written by the SEO
 * agent from verified statutes), and under them the blog's guides on the
 * law. It exists so every law page has a parent and siblings.
 *
 * Until it lists at least one law page it is a list of blog links, which is
 * not worth indexing: it stays noindexed and out of the sitemap until then.
 */
const LAW_GUIDES = ["are-electronic-signatures-legal", "legally-binding-electronic-signature", "electronic-signatures-ghana-nigeria-kenya", "electronic-vs-digital-signatures"]

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seoPages.hubs.law")
  const pages = await registryPages(["compliance"])
  return { ...pageMetadata({ title: t("metaTitle"), description: t("metaDescription", { site: siteConfig.name }), path: "/esignature-law" }), ...noindexRobots(pages.length === 0) }
}

export default async function Hub({ params }: { params: Promise<{ locale: string }> }) {
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale((await params).locale)
  const posts = getAllPosts()
  const guides = LAW_GUIDES.flatMap((slug) => {
    const post = posts.find((p) => p.slug === slug)
    return post ? [{ href: `/blog/${post.slug}`, name: post.title, description: post.description }] : []
  })
  return <HubPage hub="law" kinds={["compliance"]} path="/esignature-law" guides={guides} />
}
