import { getFormatter, getTranslations } from "next-intl/server"
import Link from "next/link"
import { ArrowRight, Check, ExternalLink, ShieldCheck } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { MarkdownBody } from "@/components/seo/markdown-body"
import { jsonLdScript } from "@/lib/json-ld"
import { pageGraph, pageTrail } from "@/lib/seo/page-graph"
import { resolveLinks } from "@/lib/seo/links"
import { fixedLinkLabels } from "@/components/seo/fixed-links"
import type { SitePage } from "@/lib/seo/pages"

/**
 * One template for every page in the SEO registry (src/lib/seo/pages.ts):
 * solutions, free tools, comparisons, alternatives and use cases.
 *
 * Order on the page follows what a visitor came for. A tool page puts the
 * working tool (`tool`, a client component) straight under the H1, above the
 * fold on a phone; everything else leads with a short answer and the calls to
 * action, then explains. Below: benefits, steps, the article itself, FAQs,
 * related pages, and a final call to action that leads to signup.
 *
 * Everything here renders on the server, so the HTML a crawler fetches holds
 * the full text, the FAQ answers (in <details>, readable with no JavaScript)
 * and the structured data, built from the same values (page-graph.ts).
 * Square corners and a single column on phones, per the design rules;
 * sections below the fold fade in with Reveal, which never hides content
 * from the first paint.
 */
export async function SeoPageView({ page, tool }: { page: SitePage; tool?: React.ReactNode }) {
  const t = await getTranslations("seoPages")
  const format = await getFormatter()
  const longDate = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
  const trail = pageTrail(page, { home: t("breadcrumbHome"), tools: t("breadcrumbTools"), compare: t("breadcrumbCompare"), useCases: t("breadcrumbUseCases") })
  const related = resolveLinks(page.related, await fixedLinkLabels())
  const isTool = page.kind === "tool"

  return (
    <article className="pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(pageGraph(page, trail)) }} />

      <header className="relative border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <BreadcrumbTrail trail={trail} />
          <p className="mt-6 inline-flex items-center gap-1.5 border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {isTool && <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
            {t(`eyebrow.${page.kind}`)}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">{page.h1}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{page.lede}</p>

          {isTool ? (
            <div className="mt-6">
              {tool}
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t("toolPrivacy")}
              </p>
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href="/signup" location={`hero:${page.path}`} className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                {t("ctaPrimary")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href="/pricing" location={`hero-pricing:${page.path}`} className="inline-flex h-12 items-center justify-center border border-border px-6 text-sm font-semibold transition-colors hover:bg-secondary">
                {t("ctaSecondary")}
              </TrackedLink>
            </div>
          )}

          {page.kind === "comparison" && page.checked && (
            <div className="mt-6 border border-border bg-card p-4 text-sm">
              <p className="text-muted-foreground">{t("checked", { competitor: page.competitor?.name ?? "", date: longDate(page.checked) })}</p>
              <ul className="mt-2 space-y-1">
                {page.sources.map((source) => (
                  <li key={source.url}>
                    <a href={source.url} rel="noopener noreferrer nofollow" target="_blank" className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
                      {source.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-14 px-4 pt-10 sm:px-6 lg:px-8">
        {page.benefits.length > 0 && (
          <Reveal as="section">
            <h2 className="text-2xl font-bold tracking-tight">{t("benefits")}</h2>
            <ul className="mt-5 grid gap-px border border-border bg-border sm:grid-cols-3">
              {page.benefits.map((b) => (
                <li key={b.title} className="bg-background p-5">
                  <Check className="h-5 w-5 text-primary" aria-hidden="true" />
                  <h3 className="mt-3 font-semibold">{b.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{b.body}</p>
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        {page.howItWorks.length > 0 && (
          <Reveal as="section">
            <h2 className="text-2xl font-bold tracking-tight">{t("howItWorks")}</h2>
            <ol className="mt-5 space-y-3">
              {page.howItWorks.map((step, i) => (
                <li key={step.title} className="flex gap-4 border border-border p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="font-semibold">{step.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        )}

        <MarkdownBody source={page.body} />

        {page.faq.length > 0 && (
          <Reveal as="section">
            <h2 id="faq" className="text-2xl font-bold tracking-tight">{t("faq")}</h2>
            <div className="mt-5 divide-y divide-border border border-border">
              {page.faq.map((item) => (
                <details key={item.q} className="group p-4 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-medium">
                    <h3 className="text-base">{item.q}</h3>
                    <span aria-hidden="true" className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        )}

        {related.length > 0 && (
          <Reveal as="section">
            <h2 className="text-2xl font-bold tracking-tight">{t("related")}</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {related.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="group flex h-full flex-col border border-border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {link.name}
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{link.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        )}

        <Reveal as="section">
          <div className="border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{isTool ? t("ctaToolTitle") : t("ctaTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{t("ctaBody")}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href="/signup" location={`footer:${page.path}`} className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                {t("ctaButton")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href="/pricing" location={`footer-pricing:${page.path}`} className="inline-flex h-12 items-center justify-center border border-border bg-background px-6 text-sm font-semibold transition-colors hover:bg-secondary">
                {t("ctaPricing")}
              </TrackedLink>
            </div>
          </div>
        </Reveal>

        <p className="text-xs text-muted-foreground">
          <time dateTime={page.updated}>{t("updated", { date: longDate(page.updated) })}</time>
        </p>
      </div>
    </article>
  )
}
