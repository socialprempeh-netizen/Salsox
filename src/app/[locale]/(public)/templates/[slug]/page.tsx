import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server"
import { ArrowRight, PenLine } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { TrackedLink } from "@/components/analytics/tracked-link"
import { TemplateActions } from "@/components/templates/template-actions"
import { TemplateDocument } from "@/components/templates/template-document"
import { pageMetadata } from "@/lib/metadata"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, faqPageJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
import { getTemplate, getTemplates, relatedTemplates, templatePdfPath, templatePlainText, TEMPLATES_PATH } from "@/lib/templates"
import { SIGNUP_TO_FIRST_DOCUMENT_PATH } from "@/lib/landing-cta"
import { siteConfig } from "@/config/site"

/**
 * /templates/{slug}: one free document template (src/lib/templates.ts).
 *
 * Mobile-first order: what it is, the three things to do with it (get it
 * signed, download, copy), then the document itself in full, then how to use
 * it, questions, related templates and a last call to action. The document is
 * the content: it is in the HTML, readable without JavaScript, and never
 * gated. Breadcrumb and FAQ structured data come from the same values the page
 * prints.
 *
 * Static: every template is generated at build, and an unknown slug is a 404.
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
  const format = await getFormatter()
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t("breadcrumb"), href: TEMPLATES_PATH },
    { name: template.h1, href: template.path },
  ]
  const jsonLd = [
    webPageJsonLd({ path: template.path, name: template.title, description: template.description, dateModified: template.updated }),
    breadcrumbJsonLd(trail),
    faqPageJsonLd(template.faq),
  ].filter(Boolean)
  const related = relatedTemplates(template, getTemplates())
  const signers = format.list(template.signers, { type: "conjunction" })
  const steps = ["fill", "download", "send"] as const

  return (
    <article className="pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />

      <header className="relative border-b border-border">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
        <div className="mx-auto max-w-4xl px-4 pb-8 pt-8 sm:px-6 sm:pt-12 lg:px-8">
          <BreadcrumbTrail trail={trail} />
          <p className="mt-6 inline-flex border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground">
            {t("eyebrow", { category: t(`category.${template.category}`) })}
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">{template.h1}</h1>
          <p className="mt-4 max-w-2xl text-base text-muted-foreground sm:text-lg">{template.lede}</p>

          <div className="mt-6">
            <TemplateActions
              slug={template.slug}
              text={templatePlainText(template.body)}
              pdfHref={templatePdfPath(template.slug)}
              signHref={SIGNUP_TO_FIRST_DOCUMENT_PATH}
              labels={{ download: t("download"), copy: t("copy"), copied: t("copied"), copyFailed: t("copyFailed"), sign: t("sign") }}
            />
            <p className="mt-3 flex items-start gap-1.5 text-sm text-muted-foreground">
              <PenLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("signHint", { signers, site: siteConfig.name })}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-4xl space-y-14 px-4 pt-10 sm:px-6 lg:px-8">
        <section aria-labelledby="template-text">
          <h2 id="template-text" className="sr-only">{t("documentLabel")}</h2>
          <div className="border border-border bg-card p-5 sm:p-10">
            <TemplateDocument markdown={template.body} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{t("disclaimer")}</p>
        </section>

        <Reveal as="section">
          <h2 className="text-2xl font-bold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-5 space-y-3">
            {steps.map((step, i) => (
              <li key={step} className="flex gap-4 border border-border p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-primary text-sm font-bold text-primary-foreground" aria-hidden="true">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{t(`steps.${step}.title`)}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{t(`steps.${step}.body`, { site: siteConfig.name })}</p>
                </div>
              </li>
            ))}
          </ol>
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

        {related.length > 0 && (
          <Reveal as="section">
            <h2 className="text-2xl font-bold tracking-tight">{t("related")}</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {related.map((tpl) => (
                <li key={tpl.slug}>
                  <Link href={tpl.path} className="group flex h-full flex-col border border-border p-4 transition-colors hover:border-primary/50 hover:bg-primary/5">
                    <span className="flex items-center justify-between gap-2 font-semibold">
                      {tpl.h1}
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="mt-1 line-clamp-2 text-sm text-muted-foreground">{tpl.lede}</span>
                  </Link>
                </li>
              ))}
            </ul>
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
              <TrackedLink href={SIGNUP_TO_FIRST_DOCUMENT_PATH} location={`template-footer:${template.slug}`} className="inline-flex h-12 items-center justify-center gap-2 bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90">
                {t("sign")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
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
