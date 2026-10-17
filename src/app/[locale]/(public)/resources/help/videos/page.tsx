import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight, Clock, PlayCircle } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { CategoryIcon } from "@/components/help/category-icon"
import { HelpMarkdown } from "@/components/help/help-markdown"
import { ScriptDisclosure } from "@/components/help/script-disclosure"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import { HELP_PATH, HELP_VIDEOS_PATH, getVideoScripts } from "@/lib/help"
import { siteConfig } from "@/config/site"

/**
 * /resources/help/videos: one card per Help Center topic.
 *
 * No video is recorded yet, so each card shows a "Coming soon" frame, and
 * under it the full recording script (content/help/videos/<topic>.md) in an
 * expandable section: what is on screen, what to say and what to click, in
 * order. When a video is ready, its URL goes in the script's `video:`
 * frontmatter and the card plays it in place of the frame; nothing else on
 * this page changes, and the script stays as the video's transcript.
 *
 * No VideoObject structured data until there is a video to describe.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("help")
  return pageMetadata({ title: `${t("videos.metaTitle")} | ${siteConfig.name}`, description: t("videos.metaDescription", { site: siteConfig.name }), path: HELP_VIDEOS_PATH })
}

export default async function HelpVideosPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale)
  const t = await getTranslations("help")
  const scripts = getVideoScripts()
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: HELP_PATH },
    { name: t("videos.breadcrumb"), href: HELP_VIDEOS_PATH },
  ]
  const jsonLd = [
    webPageJsonLd({ path: HELP_VIDEOS_PATH, name: t("videos.h1"), description: t("videos.metaDescription", { site: siteConfig.name }), type: "CollectionPage" }),
    breadcrumbJsonLd(trail),
  ]

  return (
    <section className="relative pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{t("videos.h1")}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground sm:text-lg">{t("videos.lede")}</p>

        {/* Top-aligned: an opened script lengthens its own card, not its neighbour. */}
        <ul className="mt-10 grid items-start gap-6 md:grid-cols-2">
          {scripts.map((s, i) => {
            const topic = t(`categories.${s.category}.title`)
            return (
              <Reveal as="li" key={s.category} delay={(i % 2) * 60} className="flex flex-col border border-border bg-background">
                <div id={s.category} className="scroll-mt-24">
                  {s.video ? (
                    <video controls preload="metadata" className="aspect-video w-full bg-black" aria-label={t("videos.videoLabel", { title: s.title })}>
                      <source src={s.video} />
                    </video>
                  ) : (
                    // The frame a video will fill: the topic's icon on the
                    // brand tint, with a quiet "Coming soon" tag.
                    <div className="relative flex aspect-video w-full flex-col items-center justify-center gap-3 overflow-hidden bg-primary/[0.06]">
                      <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:2rem_2rem] opacity-60" />
                      <span className="relative flex h-14 w-14 items-center justify-center bg-background text-primary shadow-sm">
                        <CategoryIcon category={s.category} className="h-7 w-7" />
                      </span>
                      <span className="relative inline-flex items-center gap-1.5 bg-foreground px-2.5 py-1 text-xs font-semibold text-background">
                        <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t("videos.comingSoon")}
                      </span>
                    </div>
                  )}
                  <div className="p-5">
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-medium text-primary">{topic}</span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {t("videos.minutes", { minutes: s.minutes })}
                      </span>
                    </p>
                    <h2 className="mt-2 text-lg font-semibold">{s.title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
                    <Link href={`${HELP_PATH}#${s.category}`} className="group mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                      {t("videos.readGuides", { category: topic })}
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </div>
                </div>
                <div className="mt-auto">
                  <ScriptDisclosure label={t("videos.script")} hint={t("videos.scriptHint")}>
                    <HelpMarkdown source={s.content} className="prose-sm prose-h2:mt-0 prose-h2:text-base prose-h3:mt-6 prose-h3:text-sm prose-p:my-2" />
                  </ScriptDisclosure>
                </div>
              </Reveal>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
