/**
 * This app's adapters for the SEO agent: the SiteAdapter for the article
 * mode (agent.ts) and the PageSite for the page mode (page-agent.ts) that
 * replaced it. The SiteAdapter (agent.ts): where its pages,
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
import type { PageSite } from "./page-agent"
import { registryPages, libraryTemplates } from "./published-pages"
import { fetchFullText, fetchSource } from "./source-fetch"
import { crawlerConfigured, crawlPages } from "@/lib/outreach-agent/crawl4ai"
import { PAGE_KINDS } from "@/lib/seo/pages"

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

/** Refreshes one public path the way the article mode does (under the [locale] segment). */
function revalidatePublic(path: string) {
  revalidatePath(`/${routing.defaultLocale}${path === "/" ? "" : path}`)
}

export const salsoxPageSite: PageSite = {
  productSummary: productSummary(),

  templates: () => libraryTemplates(),

  registry: (kinds) => registryPages(kinds),

  allRegistry: () => registryPages([...PAGE_KINDS]),

  // File posts only: they are the ones a page's related links can resolve.
  async blogPosts() {
    return getAllPosts().map((p) => ({ path: `/blog/${p.slug}`, title: p.title, category: p.category, body: p.content }))
  },

  // The registry (files and generated), the blog's file posts and the fixed
  // routes: exactly what src/lib/seo/links.ts and generatedLinkLabels resolve.
  async sitePaths() {
    const fixed = await fixedLinkLabels()
    const pages = await registryPages([...PAGE_KINDS])
    return [
      ...pages.map((p) => ({ path: p.path, name: p.breadcrumb, description: p.description })),
      ...getAllPosts().map((p) => ({ path: `/blog/${p.slug}`, name: p.title, description: p.description })),
      ...Object.entries(fixed).map(([path, label]) => ({ path, ...label })),
    ]
  },

  async coveredPhrases() {
    const pages = await registryPages([...PAGE_KINDS])
    return [
      ...getAllPosts().flatMap((p) => [p.title, ...(p.keyword ? [p.keyword] : [])]),
      ...pages.flatMap((p) => [p.title, p.h1, p.primaryKeyword, ...p.aliases]),
      ...(await libraryTemplates()).flatMap((t) => [t.title, t.h1, t.keyword]),
    ]
  },

  fetchSource: (source) => fetchSource(source),

  // Was fetchFullText(source): a statute page this server cannot reach
  // (gesetze-im-internet.de from the production network) is read through the
  // site's own Crawl4AI service instead, from the same official URL.
  readFullText: (source) =>
    fetchFullText(source, fetch, {
      viaCrawler: crawlerConfigured()
        ? async (url) => {
            const [page] = await crawlPages([url], { userAgent: `${siteConfig.name.replace(/[^A-Za-z0-9]/g, "") || "Site"}LawCheck/1.0 (+${siteConfig.url})` })
            return page?.ok ? page.markdown : null
          }
        : undefined,
    }),

  // Everything a new page appears on: its own URL, its hub, the neighbours
  // whose related cards or sibling links now include it, the sitemap and
  // /llms.txt. Whole route families are refreshed by pattern, because every
  // sibling's links change, not just one page's.
  revalidateFor(kind, path) {
    if (path.startsWith("/admin")) {
      revalidatePath(path)
      return
    }
    revalidatePath("/admin/seo/agent")
    revalidatePublic(path)
    if (kind === "TEMPLATE") {
      revalidatePath("/[locale]/templates", "layout")
      // Industry and team pages list their templates.
      revalidatePath("/[locale]/esignature-for/[slug]", "page")
      revalidatePath("/dashboard/templates", "layout")
    } else if (kind === "COMPLIANCE") {
      revalidatePath("/[locale]/esignature-law", "layout")
    } else if (kind === "USE_CASE") {
      revalidatePath("/[locale]/esignature-for", "layout")
    } else {
      revalidatePublic("/compare")
      revalidatePath("/[locale]/vs/[slug]", "page")
      revalidatePath("/[locale]/alternatives/[slug]", "page")
    }
    revalidatePath("/sitemap.xml")
    revalidatePath("/llms.txt")
  },

  today: () => new Date().toISOString().slice(0, 10),
}
