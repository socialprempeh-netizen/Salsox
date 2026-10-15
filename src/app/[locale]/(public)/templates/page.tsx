import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import { getTemplates, TEMPLATE_CATEGORIES, TEMPLATES_PATH } from "@/lib/templates"
import { siteConfig } from "@/config/site"

/**
 * /templates: every free document template (src/lib/templates.ts), grouped by
 * kind of document. The hub gives each template a parent in its breadcrumb and
 * puts all of them one click from the footer; a new file in content/templates
 * appears here without code. Server-rendered and static, like the other hubs.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("templates")
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription", { site: siteConfig.name }), path: TEMPLATES_PATH })
}

export default async function TemplatesHub({ params }: { params: Promise<{ locale: string }> }) {
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale((await params).locale)
  const t = await getTranslations("templates")
  const templates = getTemplates()
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: TEMPLATES_PATH },
  ]
  const jsonLd = [
    webPageJsonLd({ path: TEMPLATES_PATH, name: t("h1"), description: t("metaDescription", { site: siteConfig.name }), type: "CollectionPage" }),
    breadcrumbJsonLd(trail),
    itemListJsonLd(templates.map((tpl) => ({ name: tpl.h1, path: tpl.path }))),
  ]

  return (
    <section className="relative pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{t("h1")}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground sm:text-lg">{t("lede", { site: siteConfig.name })}</p>

        <div className="mt-10 space-y-12">
          {TEMPLATE_CATEGORIES.map((category) => {
            const inCategory = templates.filter((tpl) => tpl.category === category)
            if (inCategory.length === 0) return null
            return (
              <Reveal as="section" key={category}>
                <h2 id={category} className="scroll-mt-24 text-xl font-bold tracking-tight">{t(`category.${category}`)}</h2>
                <ul className="mt-4 grid gap-px border border-border bg-border sm:grid-cols-2">
                  {inCategory.map((tpl) => (
                    <li key={tpl.slug} className="bg-background">
                      <Link href={tpl.path} className="group flex h-full flex-col p-4 transition-colors hover:bg-primary/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary">
                        <span className="flex items-center justify-between gap-2 font-semibold">
                          {tpl.h1}
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </span>
                        <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tpl.lede}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )
          })}
        </div>

        <p className="mt-12 border-t border-border pt-6 text-xs text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </section>
  )
}
