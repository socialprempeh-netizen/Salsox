import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { setRequestLocale } from "next-intl/server"
import { getPages, type SitePage } from "@/lib/seo/pages"
import { sitePageMetadata } from "@/lib/seo/page-metadata"
import { SeoPageView } from "@/components/seo/seo-page-view"
import { ToolSlot } from "@/components/tools/tool-slot"
import { ClientMessagesProvider } from "@/i18n/client-provider"

/**
 * Root-level landing and free-tool pages: /online-esignature, /sign-pdf and
 * the rest, from content/pages/solutions and content/pages/tools.
 *
 * Every page is generated at build (`dynamicParams = false`), so an unknown
 * root path is a real 404 rather than a soft one, and fixed routes like
 * /pricing always win over this segment. Static, so each page is served from
 * the CDN with its full text in the HTML.
 */
export const dynamicParams = false

type Props = { params: Promise<{ locale: string; page: string }> }

const ROOT_KINDS = ["solution", "tool"] as const

function find(slug: string): SitePage | undefined {
  return ROOT_KINDS.flatMap((kind) => getPages({ kind })).find((p) => p.slug === slug)
}

export function generateStaticParams() {
  return ROOT_KINDS.flatMap((kind) => getPages({ kind })).map((p) => ({ page: p.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const page = find((await params).page)
  return page ? sitePageMetadata(page) : {}
}

export default async function RootSeoPage({ params }: Props) {
  const { locale, page: slug } = await params
  // Next renders layouts and pages independently: each states its locale so
  // next-intl never falls back to reading a request header (static rendering).
  setRequestLocale(locale)
  const page = find(slug)
  if (!page) notFound()
  // The tool gets its own messages (src/i18n/client-messages.ts, "tools"),
  // so the rest of the public site does not carry them.
  const tool = page.tool ? (
    <ClientMessagesProvider area="tools" locale={locale}>
      <ToolSlot tool={page.tool} />
    </ClientMessagesProvider>
  ) : undefined
  return <SeoPageView page={page} tool={tool} />
}
