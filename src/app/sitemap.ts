import type { MetadataRoute } from "next"
import { getAllPosts, getCategories, categorySlug, hasPosts } from "@/lib/blog"
import { getChangelog } from "@/lib/changelog"
import { getDocs, translatedLocales } from "@/lib/docs"
import { routing } from "@/i18n/routing"
import { localizedPath } from "@/i18n/alternates"
import { siteConfig } from "@/config/site"
import { isKitSite } from "@/config/kit"
import { getPages, type SitePage } from "@/lib/seo/pages"

/**
 * Sitemap built from the real public routes plus the blog content on disk,
 * so a new post is in the sitemap the moment it ships. Served at /sitemap.xml.
 *
 * **Only translated pages appear in more than one language.** A URL that
 * resolves is not the same thing as a URL worth submitting: `/it/docs/billing`
 * answers, but with the English text, and listing it would ask to have the
 * same page indexed twice. The rest of the site is English only, so the rest
 * of this file has no locale in it at all.
 */

/** One entry per language a page exists in, cross-linked with the others. */
function localized(
  path: string,
  locales: readonly string[],
  rest: Omit<MetadataRoute.Sitemap[number], "url">
): MetadataRoute.Sitemap {
  const url = (locale: string) => `${siteConfig.url}${localizedPath(path, locale)}`
  const languages =
    locales.length > 1 ? Object.fromEntries(locales.map((l) => [l, url(l)])) : undefined
  return locales.map((locale) => ({
    ...rest,
    url: url(locale),
    ...(languages ? { alternates: { languages } } : {}),
  }))
}
/** The newest of some ISO dates, as a sitemap `lastModified`, or nothing. */
function newest(dates: (string | null | undefined)[]): { lastModified: Date } | Record<string, never> {
  const latest = dates.filter((d): d is string => Boolean(d)).sort().at(-1)
  return latest ? { lastModified: new Date(`${latest}T00:00:00Z`) } : {}
}

export default function sitemap(): MetadataRoute.Sitemap {
  // A demo deployment is `noindex` (see the root layout): handing search
  // engines a list of URLs we ask them to ignore only creates noise.
  if (process.env.DEMO_MODE === "true") return []

  // A listing changes when what it lists does: the blog index on the newest
  // post, a category on its newest post, the changelog on its latest dated
  // release. Real dates here are also what the IndexNow cron
  // (src/app/api/indexnow/route.ts) reads to know what was just published.
  const allPosts = getAllPosts()
  const postDate = (p: (typeof allPosts)[number]) => p.updated ?? p.date

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${siteConfig.url}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${siteConfig.url}/pricing`, changeFrequency: "weekly", priority: 0.9 },
    // The index renders from the message files, so it exists in every language
    // that has one.
    ...localized("/docs", routing.locales, { changeFrequency: "weekly", priority: 0.8 }),
    // The blog index only once there is something in it: while empty it is
    // noindex, and listing it here would contradict that.
    ...(hasPosts()
      ? [{ url: `${siteConfig.url}/blog`, changeFrequency: "weekly" as const, priority: 0.8, ...newest(allPosts.map(postDate)) }]
      : []),
    {
      url: `${siteConfig.url}/changelog`,
      changeFrequency: "weekly",
      priority: 0.6,
      ...newest(getChangelog().releases.map((r) => r.date)),
    },
    // Both were linked from every footer and missing here, so a crawler only
    // found them by following links. Contact is the form in your app; the
    // kit's own site has a dialog instead and keeps that page out.
    { url: `${siteConfig.url}/about`, changeFrequency: "monthly", priority: 0.5 },
    // The public verification page (src/app/[locale]/(public)/verify). Its
    // ?code= results are noindex; the page itself is worth finding.
    { url: `${siteConfig.url}/verify`, changeFrequency: "yearly", priority: 0.3 },
    ...(isKitSite
      ? []
      : [{ url: `${siteConfig.url}/contact`, changeFrequency: "yearly" as const, priority: 0.4 }]),
    { url: `${siteConfig.url}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    // The kit's own site sells nothing and has no accounts, so it ships no
    // terms and no separate cookie page: the footer hides both links and the
    // cookie disclosure is a section of the privacy policy. Listing them here
    // would submit the placeholder pages for indexing. Your app keeps them.
    ...(isKitSite
      ? []
      : [
          { url: `${siteConfig.url}/terms`, changeFrequency: "yearly" as const, priority: 0.2 },
          { url: `${siteConfig.url}/cookies`, changeFrequency: "yearly" as const, priority: 0.2 },
        ]),
  ]

  const docs: MetadataRoute.Sitemap = getDocs().flatMap((doc) =>
    localized(`/docs/${doc.slug}`, translatedLocales(doc.slug), {
      changeFrequency: "weekly",
      priority: 0.7,
    })
  )

  const posts: MetadataRoute.Sitemap = allPosts.map((post) => ({
    url: `${siteConfig.url}/blog/${post.slug}`,
    // `updated` when the post declares a revision, so an edit to an old post is
    // a signal here rather than something a crawler has to notice on its own.
    lastModified: new Date(`${post.updated ?? post.date}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.7,
  }))

  const categories: MetadataRoute.Sitemap = getCategories().map((c) => ({
    url: `${siteConfig.url}/blog/category/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.4,
    ...newest(allPosts.filter((p) => categorySlug(p.category) === c.slug).map(postDate)),
  }))

  // The landing, tool, comparison and use-case pages (src/lib/seo/pages.ts),
  // each with the date it was last revised, and the hubs that list them,
  // dated by their newest page. Only published English pages; a translation
  // would be listed with hreflang alternates by `localized`, once it exists.
  const seoPages = getPages()
  const updatedOf = (pages: SitePage[]) => newest(pages.map((p) => p.updated))
  const registry: MetadataRoute.Sitemap = seoPages.flatMap((p) =>
    localized(p.path, p.locales, {
      lastModified: new Date(`${p.updated}T00:00:00Z`),
      changeFrequency: "monthly",
      priority: p.kind === "tool" || p.kind === "solution" ? 0.8 : 0.6,
    })
  )
  const hubs: MetadataRoute.Sitemap = [
    { path: "/tools", pages: seoPages.filter((p) => p.kind === "tool") },
    { path: "/compare", pages: seoPages.filter((p) => p.kind === "comparison" || p.kind === "alternative") },
    { path: "/esignature-for", pages: seoPages.filter((p) => p.kind === "use-case") },
  ]
    .filter((hub) => hub.pages.length > 0)
    .map((hub) => ({ url: `${siteConfig.url}${hub.path}`, changeFrequency: "monthly" as const, priority: 0.6, ...updatedOf(hub.pages) }))

  return [...staticRoutes, ...registry, ...hubs, ...docs, ...posts, ...categories]
}
