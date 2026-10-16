/**
 * /admin/seo/inventory: every indexable page on the site, with the keyword it
 * targets, its search intent, its page type and its status.
 *
 * Generated on each request from the same sources the site renders from (the
 * sitemap, the page registry, the template library and its taxonomy, the blog
 * and the docs) by src/lib/seo/inventory.ts, so it is accurate the moment a
 * page ships, with nothing to keep in sync by hand. It also flags published
 * pages the sitemap leaves out and keywords two URLs compete for.
 *
 * Below it, the IndexNow log (src/lib/indexnow-store.ts): the latest
 * submissions to search engines and what they answered.
 *
 * A tab of the Analytics section, beside SEO health. Admin only: the layout
 * restricts the route and the role is checked again here, as on every admin
 * page.
 */
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { routing } from "@/i18n/routing"
import sitemap from "@/app/sitemap"
import { getAllPosts, getCategories } from "@/lib/blog"
import { getDocs } from "@/lib/docs"
import { loadAllPages } from "@/lib/seo/pages"
import { buildInventory } from "@/lib/seo/inventory"
import { getTemplates, TEMPLATES_PATH } from "@/lib/templates"
import { categoryPath, MIN_TEMPLATES_PER_CATEGORY_PAGE, TEMPLATE_CATEGORIES, TEMPLATE_INDUSTRIES, TEMPLATE_TEAMS } from "@/lib/templates-taxonomy"
import { indexNowKeyFilePath, resolveIndexNowKey } from "@/lib/indexnow"
import { indexNowLog, skipReason } from "@/lib/indexnow-store"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { IndexNowLog } from "@/components/admin/indexnow-log"
import { SeoInventory } from "@/components/admin/seo-inventory"

export const dynamic = "force-dynamic"

export default async function SeoInventoryPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin.seoInventory")
  const tx = await getTranslations("templates.taxonomy")

  const templates = getTemplates()
  const { rows, conflicts } = buildInventory({
    sitemapPaths: sitemap().map((e) => new URL(e.url).pathname),
    registry: loadAllPages().filter((p) => p.locale === routing.defaultLocale),
    templates,
    // Only the categories that get a page (enough templates to not be thin).
    categories: TEMPLATE_CATEGORIES.filter((c) => templates.filter((x) => x.category === c).length >= MIN_TEMPLATES_PER_CATEGORY_PAGE).map((c) => ({
      path: categoryPath(c),
      title: tx(`category.${c}.title`),
      // The phrase the page's H1 targets, e.g. "proposal templates".
      keyword: tx(`category.${c}.h1`).toLowerCase(),
    })),
    industryPaths: Object.values(TEMPLATE_INDUSTRIES),
    teamPaths: Object.values(TEMPLATE_TEAMS),
    hubPaths: ["/tools", "/compare", "/esignature-for", TEMPLATES_PATH, "/blog", "/docs"],
    posts: getAllPosts().map((p) => ({ path: `/blog/${p.slug}`, title: p.title, updated: p.updated ?? p.date })),
    blogCategories: getCategories().map((c) => ({ path: `/blog/category/${c.slug}`, title: c.name })),
    docs: getDocs().map((d) => ({ path: `/docs/${d.slug}`, title: d.title })),
    locales: [...routing.locales],
    defaultLocale: routing.defaultLocale,
  })

  const key = resolveIndexNowKey(process.env)
  const log = await indexNowLog(20)

  return (
    <div className="space-y-6">
      <AdminReveal>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </AdminReveal>
      <AdminReveal index={1}>
        <SeoInventory rows={rows} conflicts={conflicts} origin={siteConfig.url} />
      </AdminReveal>
      <AdminReveal index={2}>
        <IndexNowLog log={log} keyFileUrl={key ? `${siteConfig.url}${indexNowKeyFilePath(key)}` : null} disabledReason={skipReason()} />
      </AdminReveal>
    </div>
  )
}
