import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight, PenLine } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { MarkdownBody } from "@/components/seo/markdown-body"
import { TemplateActions } from "@/components/templates/template-actions"
import { TemplateDocument } from "@/components/templates/template-document"
import { TemplatePreview } from "@/components/templates/template-preview"
import { TemplateCardGrid } from "@/components/templates/template-card"
import { roleTone } from "@/components/templates/role-tone"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, faqPageJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import {
  getTemplate,
  getTemplates,
  relatedTemplates,
  templateCards,
  templatePdfPath,
  templatePlainText,
  templateUsePath,
  TEMPLATES_PATH,
} from "@/lib/templates"
import { categoryPath, MIN_TEMPLATES_PER_CATEGORY_PAGE, TEMPLATE_CATEGORIES, TEMPLATE_INDUSTRIES, TEMPLATE_TEAMS } from "@/lib/templates-taxonomy"
import { siteConfig } from "@/config/site"

/**
 * /templates/{slug}: one template from the library (src/lib/templates.ts),
 * every one of them through this single page, driven by its data.
 *
 * Mobile-first order: what it is and who signs it; the three things to do
 * with it (use it in the editor, download, copy); the live preview, sample
 * and blank; then the explainer, how to use it, where it is used (industry
 * and team pages), questions, related templates and a last call to action.
 *
 * "Use this template" goes to /signup with `next` set to the template's page
 * in the dashboard: a new visitor signs up and lands on it, a signed-in one is
 * sent straight there by the proxy. Nothing on this page is gated.
 *
 * Breadcrumb and FAQ structured data come from the same values the page
 * prints. Static: every template is generated at build, an unknown slug 404s.
 */
export const dynamicParams = false

type Props = { params: Promise<{ locale: string; slug: string }> }

export function generateStaticParams() {
  return getTemplates().map((tpl) => ({ slug: tpl.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const template = getTemplate((await params).slug)
  return template ? pageMetadata({ title: template.title, description: template.description, path: template.path }) : {}
}

export default async function TemplatePage({ params }: Props) {
  const { locale, slug } = await params
  // Stated per page for static rendering (see [page]/page.tsx).
  setRequestLocale(locale)
  const template = getTemplate(slug)
  if (!template) notFound()

  const t = await getTranslations("templates")
  const tx = await getTranslations("templates.taxonomy")
  const format = await getFormatter()
  const all = getTemplates()
  const categoryCount = all.filter((x) => x.category === template.category).length
  const categoryLabel = tx(`category.${template.category}.label`)
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: TEMPLATES_PATH },
    // The category crumb only where the category has a page of its own.
    ...(categoryCount >= MIN_TEMPLATES_PER_CATEGORY_PAGE ? [{ name: categoryLabel, href: categoryPath(template.category) }] : []),
    { name: template.h1, href: template.path },
  ]
  const jsonLd = [
    webPageJsonLd({ path: template.path, name: template.title, description: template.description, dateModified: template.updated }),
    breadcrumbJsonLd(trail),
    faqPageJsonLd(template.faq),
  ].filter(Boolean)

  const related = relatedTemplates(template, all, 6)
  const relatedCards = templateCards(related)
  const signers = format.list(template.roles.map((r) => r.label), { type: "conjunction" })
  const fieldCount = template.fields.length
  const useHref = `/signup?next=${templateUsePath(template.slug)}`
  const fieldLabels = Object.fromEntries((["signature", "initials", "date", "name", "text"] as const).map((k) => [k, t(`fieldKinds.${k}`)]))
  const steps = ["use", "fill", "send"] as const

  return (
    <article className="pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="relative border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <BreadcrumbTrail trail={trail} />
          <p className="mt-6 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <span className="border border-border bg-card px-2.5 py-1">{categoryLabel}</span>
            <span className="border border-border bg-card px-2.5 py-1">{tx(`type.${template.type}`)}</span>
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">{template.h1}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{template.lede}</p>

          <div className="mt-6">
            <TemplateActions
              slug={template.slug}
              text={templatePlainText(template.body)}
              pdfHref={templatePdfPath(template.slug)}
              signHref={useHref}
              labels={{ download: t("download"), copy: t("copy"), copied: t("copied"), copyFailed: t("copyFailed"), sign: t("use") }}
            />
            <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
              <PenLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("useHint", { fields: fieldCount, signers, site: siteConfig.name })}
            </p>
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold">{t("whoSigns")}</h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {template.roles.map((role, i) => (
                <li key={role.id} className={`border px-2.5 py-1 text-xs font-medium ${roleTone(i)}`}>
                  {role.label}
                  {role.you ? ` (${t("you")})` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-14 px-4 pt-10 sm:px-6 lg:px-8">
        <section aria-labelledby="template-text">
          <h2 id="template-text" className="mb-3 text-2xl font-bold tracking-tight">
            {t("previewTitle")}
          </h2>
          <TemplatePreview
            labels={{ group: t("previewGroup"), sample: t("previewSample"), blank: t("previewBlank") }}
            sample={<TemplateDocument markdown={template.body} mode="sample" samples={template.variables} roles={template.roles} fieldLabels={fieldLabels} />}
            blank={<TemplateDocument markdown={template.body} mode="blank" samples={template.variables} roles={template.roles} fieldLabels={fieldLabels} />}
          />
          <p className="mt-3 text-xs text-muted-foreground">{t("disclaimer")}</p>
        </section>

        <Reveal as="section">
          <h2 className="text-2xl font-bold tracking-tight">{t("aboutTitle", { name: template.h1 })}</h2>
          <div className="mt-4">
            <MarkdownBody source={template.about} />
          </div>
          <dl className="mt-6 grid gap-px border border-border bg-border sm:grid-cols-3">
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">{t("factSigners")}</dt>
              <dd className="mt-1 font-semibold">{template.roles.length}</dd>
            </div>
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">{t("factFields")}</dt>
              <dd className="mt-1 font-semibold">{fieldCount}</dd>
            </div>
            <div className="bg-background p-4">
              <dt className="text-xs text-muted-foreground">{t("factBlanks")}</dt>
              <dd className="mt-1 font-semibold">{Object.keys(template.variables).length}</dd>
            </div>
          </dl>
        </Reveal>

        <Reveal as="section">
          <h2 className="text-2xl font-bold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-5 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-4 border border-border p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{t(`steps.${step}.title`, { site: siteConfig.name })}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`steps.${step}.body`, { site: siteConfig.name })}</p>
                </div>
              </li>
            ))}
          </ol>
        </Reveal>

        <Reveal as="section">
          <h2 className="text-2xl font-bold tracking-tight">{t("usedByTitle")}</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {template.industries.map((id) => (
              <li key={id}>
                <Link href={TEMPLATE_INDUSTRIES[id]} className="inline-flex border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5">
                  {tx(`industry.${id}`)}
                </Link>
              </li>
            ))}
            {template.teams.map((id) => (
              <li key={id}>
                <Link href={TEMPLATE_TEAMS[id]} className="inline-flex border border-border px-3 py-1.5 text-sm transition-colors hover:border-primary/50 hover:bg-primary/5">
                  {tx(`team.${id}`)}
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>

        {template.faq.length > 0 && (
          <Reveal as="section">
            <h2 id="faq" className="text-2xl font-bold tracking-tight">{t("faq")}</h2>
            <div className="mt-5 divide-y divide-border border border-border">
              {template.faq.map((item) => (
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

        {relatedCards.length > 0 && (
          <Reveal as="section">
            <h2 className="text-2xl font-bold tracking-tight">{t("related")}</h2>
            <div className="mt-5">
              <TemplateCardGrid cards={relatedCards} categoryLabels={Object.fromEntries(TEMPLATE_CATEGORIES.map((c) => [c, tx(`category.${c}.label`)]))} />
            </div>
            <Link href={TEMPLATES_PATH} className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">
              {t("allTemplates")}
            </Link>
          </Reveal>
        )}

        <Reveal as="section">
          <div className="border border-primary/30 bg-primary/5 p-6 sm:p-8">
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{t("ctaTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">{t("ctaBody", { site: siteConfig.name })}</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <TrackedLink href={useHref} location={`template-footer:${template.slug}`} className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                {t("use")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </TrackedLink>
              <TrackedLink href="/pricing" location={`template-pricing:${template.slug}`} className="inline-flex h-12 items-center justify-center border border-border bg-background px-6 text-sm font-semibold transition-colors hover:bg-secondary">
                {t("ctaPricing")}
              </TrackedLink>
            </div>
          </div>
        </Reveal>
      </div>
    </article>
  )
}
