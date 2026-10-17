import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight, MessageCircle, PlayCircle } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { CategoryIcon } from "@/components/help/category-icon"
import { HelpSearch } from "@/components/help/help-search"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import { HELP_PATH, HELP_VIDEOS_PATH, helpArticlePath, helpByCategory, getHelpArticles } from "@/lib/help"
import { siteConfig } from "@/config/site"

/**
 * /resources/help: the Help Center's front page.
 *
 * A search box over every guide (client-side, help-search.tsx), then the
 * eight topics as a grid, each listing its guides in reading order, then the
 * way to the video tutorials and to a person. Guides are Markdown files in
 * content/help/articles (src/lib/help.ts); topic names are in the message
 * file. Built at build time: nothing here reads the session.
 *
 * Each topic has an id (#getting-started …), which article pages link back
 * to from their breadcrumb.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help")
  return pageMetadata({ title: `${t("metaTitle")} | ${siteConfig.name}`, description: t("metaDescription", { site: siteConfig.name }), path: HELP_PATH })
}

export default async function HelpCenterPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale)
  const t = await getTranslations("help")
  const articles = getHelpArticles()
  const topics = helpByCategory(articles)
  const topicTitle = (c: string) => t(`categories.${c}.title`)

  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: HELP_PATH },
  ]
  // The same list the page shows, in the same order.
  const jsonLd = [
    webPageJsonLd({ path: HELP_PATH, name: t("h1"), description: t("metaDescription", { site: siteConfig.name }), type: "CollectionPage" }),
    breadcrumbJsonLd(trail),
    itemListJsonLd(articles.map((a) => ({ name: a.title, path: helpArticlePath(a.slug) }))),
  ]
  const searchItems = articles.map((a) => ({ href: helpArticlePath(a.slug), title: a.title, description: a.description, topic: topicTitle(a.category) }))

  return (
    <section className="relative pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-glow" />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />

        <div className="mx-auto mt-10 max-w-2xl text-center sm:mt-14">
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{t("h1")}</h1>
          <p className="mt-4 text-muted-foreground sm:text-lg">{t("lede", { site: siteConfig.name })}</p>
          <div className="mt-8 text-left">
            <HelpSearch items={searchItems} />
          </div>
        </div>

        <h2 className="mt-16 text-xl font-bold tracking-tight sm:mt-20">{t("topicsTitle")}</h2>
        {/* One-pixel gaps on a border-coloured grid: square tiles with shared
            hairlines, the same device as the template categories. */}
        <ul className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {topics.map(({ category, articles: list }, i) => (
            <Reveal as="li" key={category} delay={Math.min(i, 7) * 40} className="flex flex-col bg-background">
              <div id={category} className="flex h-full scroll-mt-24 flex-col p-5">
                <span className="flex h-10 w-10 items-center justify-center bg-primary/10 text-primary">
                  <CategoryIcon category={category} className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{topicTitle(category)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(`categories.${category}.blurb`)}</p>
                <ul className="mt-4 space-y-1 border-t border-border pt-3">
                  {list.map((a) => (
                    <li key={a.slug}>
                      <Link href={helpArticlePath(a.slug)} className="group flex items-start gap-2 py-1 text-sm transition-colors hover:text-primary">
                        <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
                        <span>{a.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="mt-auto pt-4 text-xs text-muted-foreground">{t("articleCount", { count: list.length })}</p>
              </div>
            </Reveal>
          ))}
        </ul>

        <div className="mt-12 grid gap-px border border-border bg-border md:grid-cols-2">
          <Link href={HELP_VIDEOS_PATH} className="group flex items-start gap-4 bg-background p-6 transition-colors hover:bg-primary/5">
            <PlayCircle className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-lg font-semibold">{t("videosTitle")}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t("videosBody")}</span>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                {t("videosCta")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </span>
          </Link>
          <Link href="/contact" className="group flex items-start gap-4 bg-background p-6 transition-colors hover:bg-primary/5">
            <MessageCircle className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-lg font-semibold">{t("contactTitle")}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{t("contactBody")}</span>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                {t("contactCta")} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  )
}
