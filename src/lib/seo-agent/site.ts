/**
 * This app's SiteAdapter for the SEO agent (agent.ts): where its pages,
 * blog, traffic and cache come from. The rest of src/lib/seo-agent is written
 * against the adapter type and knows nothing about the app, so moving the
 * agent to another site means writing another one of these.
 *
 * Settings: SEARCH_CONSOLE_SITE_URL names the Search Console property
 * ("https://example.com/" for a URL-prefix property, "sc-domain:example.com"
 * for a domain one); without it, the site's own URL with a trailing slash.
 */
import { revalidatePath } from "next/cache"
import sitemap from "@/app/sitemap"
import { fixedLinkLabels } from "@/components/seo/fixed-links"
import { siteConfig } from "@/config/site"
import { routing } from "@/i18n/routing"
import { topPagePaths } from "@/lib/admin/ga-data"
import { getAllPosts, getCategories } from "@/lib/blog"
import { productSummary } from "@/lib/product-summary"
import { crawlSite } from "@/lib/seo/crawl"
import { getPages } from "@/lib/seo/pages"
import { getTemplates } from "@/lib/templates"
import type { LinkablePage, SiteAdapter } from "./agent"
import { countWords } from "./article"

export function searchConsoleSite(env: Record<string, string | undefined> = process.env): string {
  return env.SEARCH_CONSOLE_SITE_URL?.trim() || `${siteConfig.url.replace(/\/$/, "")}/`
}

export const salsoxSite: SiteAdapter = {
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
  productSummary: productSummary(),
  searchConsoleSite: searchConsoleSite(),

  coveredPhrases() {
    return [
      ...getAllPosts().flatMap((p) => [p.title, ...(p.keyword ? [p.keyword] : [])]),
      ...getPages().flatMap((p) => [p.title, p.h1, p.primaryKeyword, ...p.aliases]),
      ...getTemplates().flatMap((t) => [t.title, t.h1, t.keyword]),
    ]
  },

  takenSlugs() {
    return new Set(getAllPosts().map((p) => p.slug))
  },

  categories() {
    return getCategories().map((c) => c.name)
  },

  // The pages an article may link to are the ones the post page can show as
  // "related" (src/lib/seo/links.ts resolves exactly these), so every link
  // the writer picks renders.
  async sitePaths() {
    const fixed = await fixedLinkLabels()
    return [
      ...getPages().map((p) => ({ path: p.path, name: p.breadcrumb, description: p.description })),
      ...getAllPosts().map((p) => ({ path: `/blog/${p.slug}`, name: p.title, description: p.description })),
      ...Object.entries(fixed).map(([path, label]) => ({ path, ...label })),
    ]
  },

  styleReferences() {
    return getAllPosts().map((p) => ({ title: p.title, markdown: p.content, words: countWords(p.content), keyword: p.keyword, hasFaq: Boolean(p.faq?.length) }))
  },

  linkablePages() {
    const pages: LinkablePage[] = [
      ...getAllPosts().map((p) => ({ path: `/blog/${p.slug}`, title: p.title, markdown: p.content })),
      ...getPages().map((p) => ({ path: p.path, title: p.h1, markdown: p.body })),
    ]
    return new Map(pages.map((p) => [p.path, p]))
  },

  topPages() {
    return topPagePaths(30, 50)
  },

  async crawl() {
    const entries = await sitemap()
    const result = await crawlSite({ origin: siteConfig.url, sitemapUrls: entries.map((e) => e.url) })
    return result.pages.filter((p) => p.status === 200).map((p) => ({ path: new URL(p.url).pathname, internalLinks: p.internalLinks }))
  },

  revalidate(paths) {
    // Public pages render under the [locale] segment, which the address does
    // not show (next-intl rewrites /blog/x to /en/blog/x), and revalidatePath
    // matches the route, not the address: "/blog/x" alone would miss the
    // cached copy. Only the pages named are refreshed, never the whole site:
    // each one re-renders reading its content files, which are traced into
    // the functions that serve them (outputFileTracingIncludes).
    for (const path of paths) {
      if (path.startsWith("/admin")) revalidatePath(path)
      else revalidatePath(`/${routing.defaultLocale}${path === "/" ? "" : path}`)
    }
    if (paths.some((p) => p === "/blog" || p.startsWith("/blog/"))) {
      // The index, its pages, the categories and the feed list the article.
      revalidatePath("/[locale]/blog", "layout")
      revalidatePath("/sitemap.xml")
      revalidatePath("/llms.txt")
    }
  },
}
