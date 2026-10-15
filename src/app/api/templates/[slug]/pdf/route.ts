/**
 * GET /api/templates/{slug}/pdf: a free template as a PDF download
 * (src/lib/templates-pdf.ts), linked from each /templates/{slug} page.
 *
 * Public and static: the templates are files in the repo, so every PDF is
 * built once at build time and served from the cache after. Unknown slugs are
 * a 404. Kept out of search results with X-Robots-Tag: the page is the thing
 * to rank, not a second copy of its text.
 */
import { siteConfig } from "@/config/site"
import { getTemplate, getTemplates, templatePath } from "@/lib/templates"
import { renderTemplatePdf } from "@/lib/templates-pdf"
import { getTranslations } from "next-intl/server"
import { routing } from "@/i18n/routing"

export const dynamicParams = false

export function generateStaticParams() {
  return getTemplates().map((t) => ({ slug: t.slug }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const template = getTemplate((await params).slug)
  if (!template) return new Response("Not found", { status: 404 })
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "templates" })
  const host = siteConfig.url.replace(/^https?:\/\//, "")
  const pdf = await renderTemplatePdf({
    title: template.h1,
    markdown: template.body,
    footer: t("pdfFooter", { site: siteConfig.name, url: `${host}${templatePath(template.slug)}` }),
  })
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${template.slug}.pdf"`,
      "X-Robots-Tag": "noindex",
      "Cache-Control": "public, max-age=86400",
    },
  })
}
