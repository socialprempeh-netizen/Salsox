/**
 * /dashboard/templates: the template library inside the app.
 *
 * The user's saved templates first (their customised copies, each opening the
 * use form with its values), then the full library with the same search and
 * filters as the public page, where every card leads to the use form instead
 * of the public page.
 */
import { Suspense } from "react"
import Link from "next/link"
import { getFormatter, getTranslations } from "next-intl/server"
import { ArrowRight } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { templateCards } from "@/lib/templates"
import { libraryTemplates } from "@/lib/seo-agent/published-pages"
import { listSavedTemplates } from "@/lib/esign/templates"
import { TemplateLibrary } from "@/components/templates/template-library"
import { TemplateCardGrid } from "@/components/templates/template-card"
import { libraryProps } from "@/components/templates/library-props"

export default async function DashboardTemplatesPage() {
  const user = await requireUser()
  const t = await getTranslations("dashboard.templates")
  const format = await getFormatter()
  const [saved, { options, labels }] = await Promise.all([listSavedTemplates(user.id), libraryProps()])
  // Was getTemplates(): templates the SEO agent published can be used too.
  const library = await libraryTemplates()
  const cards = templateCards(library)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle", { count: cards.length })}</p>
      </div>

      {saved.length > 0 && (
        <section className="border border-border bg-card">
          <h2 className="border-b border-border p-4 font-semibold">{t("mine")}</h2>
          <ul className="divide-y divide-border">
            {saved.map((s) => {
              const base = library.find((x) => x.slug === s.templateSlug)
              if (!base) return null
              return (
                <li key={s.id}>
                  <Link href={`/dashboard/templates/${s.templateSlug}?saved=${s.id}`} className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/40">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{t("savedFrom", { template: base.h1, date: format.dateTime(s.updatedAt, { dateStyle: "medium" }) })}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <Suspense fallback={<TemplateCardGrid cards={cards} categoryLabels={options.category} hrefBase="/dashboard/templates" />}>
        <TemplateLibrary cards={cards} options={options} labels={labels} hrefBase="/dashboard/templates" />
      </Suspense>
    </div>
  )
}
