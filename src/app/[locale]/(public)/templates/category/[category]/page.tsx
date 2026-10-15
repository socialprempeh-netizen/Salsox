import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { TemplateCardGrid } from "@/components/templates/template-card"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import { getTemplates, templateCards, TEMPLATES_PATH } from "@/lib/templates"
import { categoryPath, MIN_TEMPLATES_PER_CATEGORY_PAGE, TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/templates-taxonomy"
import { SIGNUP_TO_FIRST_DOCUMENT_PATH } from "@/lib/landing-cta"
import { siteConfig } from "@/config/site"

/**
 * /templates/category/{category}: every template of one kind (proposals,
 * NDAs, leases…), with an introduction written for that kind of document.
 *
 * A category gets a page only with at least MIN_TEMPLATES_PER_CATEGORY_PAGE
 * templates; below that the page would be thin, so it is not generated and
 * the category is reachable through the library's filter instead.
 */
export const dynamicParams = false

type Props = { params: Promise<{ locale: string; category: string }> }

function pageCategories(): TemplateCategory[] {
  const all = getTemplates()
  return TEMPLATE_CATEGORIES.filter((c) => all.filter((t) => t.category === c).length >= MIN_TEMPLATES_PER_CATEGORY_PAGE)
}

export function generateStaticParams() {
  return pageCategories().map((category) => ({ category }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params
  if (!pageCategories().includes(category as TemplateCategory)) return {}
  const tx = await getTranslations("templates.taxonomy")
  return pageMetadata({ title: tx(`category.${category}.title`), description: tx(`category.${category}.description`, { site: siteConfig.name }), path: categoryPath(category as TemplateCategory) })
}

export default async function TemplateCategoryPage({ params }: Props) {
  const { locale, category: raw } = await params
  setRequestLocale(locale)
  if (!pageCategories().includes(raw as TemplateCategory)) notFound()
  const category = raw as TemplateCategory

  const t = await getTranslations("templates")
  const tx = await getTranslations("templates.taxonomy")
  const templates = getTemplates().filter((tpl) => tpl.category === category)
  const path = categoryPath(category)
  const label = tx(`category.${category}.label`)
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: TEMPLATES_PATH },
    { name: label, href: path },
  ]
  const jsonLd = [
    webPageJsonLd({ path, name: tx(`category.${category}.h1`), description: tx(`category.${category}.description`, { site: siteConfig.name }), type: "CollectionPage" }),
    breadcrumbJsonLd(trail),
    itemListJsonLd(templates.map((tpl) => ({ name: tpl.h1, path: tpl.path }))),
  ]
  const others = pageCategories().filter((c) => c !== category)

  return (
    <section className="relative pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{tx(`category.${category}.h1`)}</h1>
        <p className="mt-4 max-w-3xl text-muted-foreground sm:text-lg">{tx(`category.${category}.intro`, { site: siteConfig.name })}</p>

        <div className="mt-8">
          <TemplateCardGrid cards={templateCards(templates)} categoryLabels={{ [category]: label }} />
        </div>

        <Reveal as="section" className="mt-14">
          <div className="border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("ctaTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{t("ctaBody", { site: siteConfig.name })}</p>
            <TrackedLink href={SIGNUP_TO_FIRST_DOCUMENT_PATH} location={`template-category:${category}`} className="mt-5 inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
              {t("startFree")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </TrackedLink>
          </div>
        </Reveal>

        <Reveal as="section" className="mt-14">
          <h2 className="text-xl font-bold tracking-tight">{t("otherCategories")}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {others.map((c) => (
              <li key={c}>
                <Link href={categoryPath(c)} className="inline-flex border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5">
                  {tx(`category.${c}.label`)}
                </Link>
              </li>
            ))}
            <li>
              <Link href={TEMPLATES_PATH} className="inline-flex border border-border px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:border-primary/50">
                {t("allTemplates")}
              </Link>
            </li>
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
