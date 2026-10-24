import { getFormatter, getTranslations } from "next-intl/server"
import Link from "next/link"
import { ArrowRight, Check, ExternalLink, ShieldCheck, CheckCircle2, Clock } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { FadeUp } from "@/components/motion/fade-up"
import { Reveal } from "@/components/landing/reveal"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { EmailCapture } from "@/components/landing/email-capture"
import { NEW_DOCUMENT_PATH, SIGNUP_TO_FIRST_DOCUMENT_PATH } from "@/lib/landing-cta"
import { MarkdownBody } from "@/components/seo/markdown-body"
import { jsonLdScript } from "@/lib/json-ld"
import { pageGraph, pageTrail } from "@/lib/seo/page-graph"
import { resolveLinks } from "@/lib/seo/links"
import { fixedLinkLabels } from "@/components/seo/fixed-links"
import type { SitePage } from "@/lib/seo/pages"
import { templateCards, templatesFor, TEMPLATES_PATH } from "@/lib/templates"
import { generatedLinkLabels, libraryTemplates, siblingLinks } from "@/lib/seo-agent/published-pages"
import { TEMPLATE_CATEGORIES } from "@/lib/templates-taxonomy"
import { TemplateCardGrid } from "@/components/templates/template-card"
import { injectLinks } from "@/lib/seo-agent/links"
import { linksFrom } from "@/lib/seo-agent/store"

/**
 * One template for every page in the SEO registry (src/lib/seo/pages.ts):
 * solutions, free tools, comparisons, alternatives and use cases.
 *
 * Pages the SEO agent wrote (src/lib/seo-agent/page-agent.ts) render here
 * exactly like the files. Comparison, alternative and law pages also link
 * sideways to their neighbours in the hub (siblingLinks), so every page in
 * a hub, a newly published one included, has links in from the pages
 * beside it; a law page shows the statutes it was checked against the way a
 * comparison shows its sources.
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
  // Links the SEO agent added to this page when it published an article
  // (src/lib/seo-agent/links.ts), spliced in here; the page's file is untouched.
  const body = injectLinks(page.body, await linksFrom(page.path))
  const trail = pageTrail(page, { home: t("breadcrumbHome"), tools: t("breadcrumbTools"), compare: t("breadcrumbCompare"), useCases: t("breadcrumbUseCases"), law: t("breadcrumbLaw"), integrations: t("breadcrumbIntegrations") })
  // Was resolveLinks(page.related, await fixedLinkLabels()): generated pages
  // can be related too, so their labels join the fixed ones.
  const related = resolveLinks(page.related, { ...(await fixedLinkLabels()), ...(await generatedLinkLabels()) })
  const siblings = await siblingLinks(page)
  const isTool = page.kind === "tool"
  const isLaw = page.kind === "compliance"
  // Industry and team pages show their templates from the library.
  // Was templatesFor(page.templates): the library includes generated templates.
  const pageTemplates = page.templates ? templatesFor(page.templates, await libraryTemplates()) : []
  const tx = await getTranslations("templates.taxonomy")
  const templateQuery = page.templates?.industry
    ? `?industry=${page.templates.industry}`
    : page.templates?.team
      ? `?team=${page.templates.team}`
      : page.templates?.category
        ? `?category=${page.templates.category}`
        : ""

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
            // Was a "Start free" button beside "See pricing"; the email row
            // (email-capture.tsx) now leads, and pricing follows as a link.
            // <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            //   <TrackedLink href="/signup" location={`hero:${page.path}`} className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
            //     {t("ctaPrimary")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            //   </TrackedLink>
            //   <TrackedLink href="/pricing" location={`hero-pricing:${page.path}`} className="inline-flex h-12 items-center justify-center border border-border px-6 text-sm font-semibold transition-colors hover:bg-secondary">
            //     {t("ctaSecondary")}
            //   </TrackedLink>
            // </div>
            <div className="mt-6">
              <EmailCapture signupHref={SIGNUP_TO_FIRST_DOCUMENT_PATH} signedInHref={NEW_DOCUMENT_PATH} location={`hero:${page.path}`} align="start" size="md" showNote={false} />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("heroNote")}{" "}
                <TrackedLink href="/pricing" location={`hero-pricing:${page.path}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {t("ctaSecondary")}
                </TrackedLink>
              </p>
            </div>
          )}

          {/* Where an integration stands, said before anything else on the
              page: what works today, or that the connection is still being
              built, so nobody signs up for something that is not there. */}
          {page.integration && (
            <FadeUp delay={0.15}>
            <div
              className={
                page.integration.status === "works-today"
                  ? "mt-6 flex gap-3 border border-l-4 border-primary/30 border-l-primary bg-primary/5 p-4 text-sm"
                  : "mt-6 flex gap-3 border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-500/5 p-4 text-sm"
              }
            >
              {page.integration.status === "works-today" ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              )}
              <p className="text-foreground">
                {t(page.integration.status === "works-today" ? "integrationWorksToday" : "integrationInDevelopment", { tool: page.integration.name })}{" "}
                {page.integration.status === "in-development" && (
                  <TrackedLink href="/contact" location={`integration-ask:${page.path}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {t("integrationAsk")}
                  </TrackedLink>
                )}
              </p>
            </div>
            </FadeUp>
          )}

          {/* Was comparisons only; a law page cites its statutes the same way. */}
          {(page.kind === "comparison" || page.kind === "compliance") && page.checked && (
            <div className="mt-6 border border-border bg-card p-4 text-sm">
              <p className="text-muted-foreground">
                {page.kind === "compliance" ? t("checkedLaw", { date: longDate(page.checked) }) : t("checked", { competitor: page.competitor?.name ?? "", date: longDate(page.checked) })}
              </p>
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

        <MarkdownBody source={body} />

        {pageTemplates.length > 0 && (
          <Reveal as="section">
            <h2 id="templates" className="text-2xl font-bold tracking-tight">{t("templatesTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("templatesHint", { count: pageTemplates.length })}</p>
            <div className="mt-5">
              <TemplateCardGrid cards={templateCards(pageTemplates.slice(0, 6))} categoryLabels={Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c, tx(`category.${c}.label`)]))} />
            </div>
            <Link href={`${TEMPLATES_PATH}${templateQuery}`} className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t("templatesAll", { count: pageTemplates.length })}
            </Link>
          </Reveal>
        )}

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

        {siblings.length > 0 && (
          <Reveal as="section">
            <h2 className="text-2xl font-bold tracking-tight">{t(isLaw ? "siblingsLaw" : "siblingsCompare")}</h2>
            <ul className="mt-5 divide-y divide-border border border-border">
              {siblings.map((p) => (
                <li key={p.path}>
                  <Link href={p.path} className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-primary/5">
                    <span className="min-w-0">
                      <span className="block font-semibold">{p.h1}</span>
                      <span className="mt-0.5 block line-clamp-1 text-sm text-muted-foreground">{p.description}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={isLaw ? "/esignature-law" : "/compare"} className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t(isLaw ? "siblingsLawAll" : "siblingsCompareAll")}
            </Link>
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
