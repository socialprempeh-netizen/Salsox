/**
 * The preview of one page the SEO agent wrote in its page mode
 * (src/lib/seo-agent/page-agent.ts), shown before it is published: its
 * quality gates, then the page itself. A comparison, alternatives or law page
 * renders through the same SeoPageView the public route uses, so the preview
 * is what readers would get; a template shows its document (sample and
 * blank), explainer and questions. Publish and Discard sit at the top.
 * Rendered by /admin/seo/agent/[id] when the id is a page rather than an
 * article (that route checks the admin); drafts and flagged pages are
 * reachable nowhere else.
 */
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowLeft } from "lucide-react"
import type { SeoAgentPage } from "@prisma/client"
import { REGISTRY_KIND, storedPath, toSitePage, toTemplate } from "@/lib/seo-agent/page-draft"
import type { QualityReport } from "@/lib/seo-agent/quality"
import { MarkdownBody } from "@/components/seo/markdown-body"
import { SeoPageView } from "@/components/seo/seo-page-view"
import { TemplateDocument } from "@/components/templates/template-document"
import { TemplatePreview } from "@/components/templates/template-preview"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { GateStrip, PageDraftActions, type GateRow } from "@/components/admin/seo-agent-pages"

export async function SeoAgentPagePreview({ row }: { row: SeoAgentPage }) {
  const t = await getTranslations("admin.seoAgent")
  const tt = await getTranslations("templates")
  const path = storedPath(row.kind, row.slug)
  const report = row.report as QualityReport | null
  const stored = { data: row.data, body: row.body }
  const banner =
    row.status === "PUBLISHED"
      ? t("publishedBanner", { path })
      : row.status === "DISCARDED"
        ? t("pageDiscardedBanner")
        : row.status === "FAILED"
          ? t("pageFailedBanner")
          : row.status === "FLAGGED"
            ? t("pageFlaggedBanner", { path, value: Math.round(row.similarity * 100), closest: row.similarTo ?? "" })
            : t("pageDraftBanner", { path })

  const template = row.kind === "TEMPLATE" && row.data ? toTemplate(row.slug, stored) : null
  const page = row.kind !== "TEMPLATE" && row.data ? toSitePage(REGISTRY_KIND[row.kind], row.slug, stored) : null
  const fieldLabels = Object.fromEntries((["signature", "initials", "date", "name", "text"] as const).map((k) => [k, tt(`fieldKinds.${k}`)]))

  return (
    <div className="space-y-6">
      <Link href="/admin/seo/agent" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="h-4 w-4" />
        {t("back")}
      </Link>

      <AdminReveal className="space-y-4 border border-border border-l-2 border-l-amber-500 bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 break-words text-sm">{banner}</p>
          {(row.status === "DRAFT" || row.status === "FLAGGED") && <PageDraftActions pageId={row.id} flagged={row.status === "FLAGGED"} />}
        </div>
        {report && <GateStrip gates={report.gates as GateRow[]} />}
        {row.status === "FAILED" && row.error && <p className="break-words text-sm text-destructive">{row.error}</p>}
      </AdminReveal>

      <AdminReveal index={1} className="min-w-0 border border-border">
        {page && "page" in page && <SeoPageView page={page.page} />}
        {template && "template" in template && (
          <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-8">
            <div>
              <h1 className="break-words text-3xl font-bold tracking-tight">{template.template.h1}</h1>
              <p className="mt-3 text-lg text-muted-foreground">{template.template.lede}</p>
            </div>
            <TemplatePreview
              labels={{ group: tt("previewGroup"), sample: tt("previewSample"), blank: tt("previewBlank") }}
              sample={<TemplateDocument markdown={template.template.body} mode="sample" samples={template.template.variables} roles={template.template.roles} fieldLabels={fieldLabels} />}
              blank={<TemplateDocument markdown={template.template.body} mode="blank" samples={template.template.variables} roles={template.template.roles} fieldLabels={fieldLabels} />}
            />
            <MarkdownBody source={template.template.about} />
            <div className="divide-y divide-border border border-border">
              {template.template.faq.map((f) => (
                <div key={f.q} className="p-4">
                  <h2 className="font-medium">{f.q}</h2>
                  <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {((template && "problems" in template) || (page && "problems" in page)) && (
          <p className="p-4 text-sm text-destructive">{t("previewInvalid")}</p>
        )}
        {!template && !page && <p className="p-4 text-sm text-muted-foreground">{t("previewNone")}</p>}
      </AdminReveal>
    </div>
  )
}
