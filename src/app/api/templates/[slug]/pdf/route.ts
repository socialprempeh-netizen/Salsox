/**
 * GET /api/templates/{slug}/pdf: a free template as a PDF download
 * (src/lib/templates-pdf.ts), linked from each /templates/{slug} page.
 *
 * Public and static: the file templates' PDFs are built once at build time
 * and served from the cache after; a template the SEO agent published is
 * built on its first request. Unknown slugs are a 404. Kept out of search results with X-Robots-Tag: the page is the thing
 * to rank, not a second copy of its text.
 */
import { siteConfig } from "@/config/site"
import { fillVariables, getTemplates, templatePath } from "@/lib/templates"
import { findLibraryTemplate } from "@/lib/seo-agent/published-pages"
import { renderTemplatePdf } from "@/lib/templates-pdf"
import { getTranslations } from "next-intl/server"
import { routing } from "@/i18n/routing"

// Was false: every template was a file known at build.
// export const dynamicParams = false
export const dynamicParams = true

export function generateStaticParams() {
  return getTemplates().map((t) => ({ slug: t.slug }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const template = (await findLibraryTemplate((await params).slug))?.template
  if (!template) return new Response("Not found", { status: 404 })
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "templates" })
  const host = siteConfig.url.replace(/^https?:\/\//, "")
  // Blanks print as written ([Client name]) so the downloaded copy shows what
  // to fill in; "Use this template" fills them instead.
  const { bytes: pdf } = await renderTemplatePdf({
    title: template.h1,
    markdown: fillVariables(template.body, {}),
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
