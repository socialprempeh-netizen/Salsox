import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowLeft, ArrowRight, ListOrdered, MessageCircle } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { CategoryIcon } from "@/components/help/category-icon"
import { HelpMarkdown } from "@/components/help/help-markdown"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd } from "@/lib/seo/jsonld"
import { techArticleJsonLd } from "@/lib/structured-data"
import { HELP_PATH, getHelpArticle, getHelpArticles, helpArticlePath, neighbours } from "@/lib/help"
import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"

/**
 * /resources/help/<slug>: one Help Center guide (content/help/articles).
 *
 * The guide's numbered steps are drawn as steps by help-markdown.tsx. Beside
 * it on wide screens, and below it on phones, the other guides in the same
 * topic; under it, the previous and next guides in reading order, and the way
 * to a person. Every guide is known at build time, so an unknown slug is a
 * 404 without rendering.
 */
export const dynamicParams = false

export function generateStaticParams() {
  return getHelpArticles().map((a) => ({ slug: a.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const article = getHelpArticle(slug)
  if (!article) return {}
  const t = await getTranslations("help")
  return pageMetadata({ title: `${article.title} | ${t("breadcrumb")} | ${siteConfig.name}`, description: article.description, path: helpArticlePath(slug), type: "article" })
}

export default async function HelpArticlePage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params
  setRequestLocale(locale)
  const all = getHelpArticles()
  const article = all.find((a) => a.slug === slug)
  if (!article) notFound()
  const t = await getTranslations("help")
  const topic = t(`categories.${article.category}.title`)
  const siblings = all.filter((a) => a.category === article.category)
  const { previous, next } = neighbours(slug, all)

  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: HELP_PATH },
    { name: topic, href: `${HELP_PATH}#${article.category}` },
    { name: article.title, href: helpArticlePath(slug) },
  ]
  // The breadcrumb's topic step is an anchor on the index; the structured
  // trail lists real pages only, so it skips it.
  const jsonLd = [
    techArticleJsonLd({ title: article.title, description: article.description, path: helpArticlePath(slug), inLanguage: "en" }),
    breadcrumbJsonLd(trail.filter((c) => !c.href.includes("#"))),
  ]

  const topicNav = (
    <nav aria-label={t("moreIn", { category: topic })} className="border border-border">
      <p className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-sm font-semibold">
        <CategoryIcon category={article.category} className="h-4 w-4 text-primary" />
        {t("moreIn", { category: topic })}
      </p>
      <ul className="divide-y divide-border">
        {siblings.map((a) => (
          <li key={a.slug}>
            <Link
              href={helpArticlePath(a.slug)}
              aria-current={a.slug === slug ? "page" : undefined}
              className={cn(
                "block border-l-2 px-4 py-2.5 text-sm transition-colors hover:bg-primary/5",
                a.slug === slug ? "border-primary bg-primary/5 font-medium text-primary" : "border-transparent"
              )}
            >
              {a.title}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )

  return (
    <section className="pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />
        <div className="mt-8 lg:grid lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-12">
          <div className="min-w-0 max-w-3xl">
            <header>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <Link href={`${HELP_PATH}#${article.category}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
                  <CategoryIcon category={article.category} className="h-4 w-4" />
                  {topic}
                </Link>
                <span className="inline-flex items-center gap-1.5">
                  <ListOrdered className="h-4 w-4" aria-hidden="true" />
                  {t("steps", { count: article.steps })}
                </span>
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{article.title}</h1>
              <p className="mt-3 text-lg text-muted-foreground">{article.description}</p>
            </header>

            <article className="mt-8 border-t border-border pt-2">
              <HelpMarkdown source={article.content} />
            </article>

            {(previous || next) && (
              <nav aria-label={t("breadcrumb")} className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-2">
                {previous ? (
                  <Link href={helpArticlePath(previous.slug)} className="group flex flex-col bg-background p-4 transition-colors hover:bg-primary/5">
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" aria-hidden="true" /> {t("previous")}
                    </span>
                    <span className="mt-1 font-medium">{previous.title}</span>
                  </Link>
                ) : (
                  <span className="hidden bg-background sm:block" />
                )}
                {next && (
                  <Link href={helpArticlePath(next.slug)} className="group flex flex-col bg-background p-4 text-right transition-colors hover:bg-primary/5">
                    <span className="inline-flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                      {t("next")} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="mt-1 font-medium">{next.title}</span>
                  </Link>
                )}
              </nav>
            )}

            <div className="mt-8 flex flex-col gap-3 border border-border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-semibold">{t("contactTitle")}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("contactBody")}</p>
              </div>
              <Link href="/contact" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 border border-border bg-background px-4 text-sm font-medium transition-colors hover:border-primary hover:text-primary">
                <MessageCircle className="h-4 w-4" aria-hidden="true" /> {t("contactCta")}
              </Link>
            </div>

            <div className="mt-8 lg:hidden">{topicNav}</div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24">{topicNav}</div>
          </aside>
        </div>
      </div>
    </section>
  )
}
