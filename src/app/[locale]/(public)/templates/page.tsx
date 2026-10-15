import type { Metadata } from "next"
import { Suspense } from "react"
import Link from "next/link"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { TemplateLibrary } from "@/components/templates/template-library"
import { TemplateCardGrid } from "@/components/templates/template-card"
import { libraryProps } from "@/components/templates/library-props"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import { getTemplates, templateCards, TEMPLATES_PATH } from "@/lib/templates"
import { categoryPath, MIN_TEMPLATES_PER_CATEGORY_PAGE, TEMPLATE_CATEGORIES } from "@/lib/templates-taxonomy"
import { siteConfig } from "@/config/site"

/**
 * /templates: the template library (src/lib/templates.ts).
 *
 * The searchable, filterable grid (template-library.tsx) with every template,
 * then links to each category's own page. The grid is a client component
 * that reads its filters from the URL; while it loads (and for crawlers and
 * readers without JavaScript) the server renders every template as a plain
 * grid in its place, so no template is ever reachable only through a filter.
 *
 * Filtered views (?category=…) are the same page: its canonical URL is the
 * bare /templates, so they are never indexed separately. The category pages
 * are the indexable way into a subset.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates")
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription", { site: siteConfig.name }), path: TEMPLATES_PATH })
}

export default async function TemplatesHub({ params }: { params: Promise<{ locale: string }> }) {
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale((await params).locale)
  const t = await getTranslations("templates")
  const tx = await getTranslations("templates.taxonomy")
  const templates = getTemplates()
  const cards = templateCards(templates)
  const { options, labels } = await libraryProps()
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: TEMPLATES_PATH },
  ]
  const jsonLd = [
    webPageJsonLd({ path: TEMPLATES_PATH, name: t("h1"), description: t("metaDescription", { site: siteConfig.name }), type: "CollectionPage" }),
    breadcrumbJsonLd(trail),
    itemListJsonLd(templates.map((tpl) => ({ name: tpl.h1, path: tpl.path }))),
  ]
  const categories = TEMPLATE_CATEGORIES.map((c) => ({ id: c, count: templates.filter((tpl) => tpl.category === c).length })).filter((c) => c.count >= MIN_TEMPLATES_PER_CATEGORY_PAGE)

  return (
    <section className="relative pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{t("h1")}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground sm:text-lg">{t("lede", { site: siteConfig.name, count: templates.length })}</p>

        <div className="mt-8">
          <Suspense fallback={<TemplateCardGrid cards={cards} categoryLabels={options.category} />}>
            <TemplateLibrary cards={cards} options={options} labels={labels} />
          </Suspense>
        </div>

        <Reveal as="section" className="mt-16">
          <h2 className="text-xl font-bold tracking-tight">{t("browseCategories")}</h2>
          <ul className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <li key={c.id} className="bg-background">
                <Link href={categoryPath(c.id)} className="flex h-full items-center justify-between gap-3 p-4 transition-colors hover:bg-primary/5">
                  <span className="font-medium">{tx(`category.${c.id}.label`)}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">{c.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>

        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </section>
  )
}
