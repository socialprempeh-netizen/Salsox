import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight } from "lucide-react"
import { BreadcrumbTrail } from "@/components/ui/breadcrumb"
import { Reveal } from "@/components/landing/reveal"
import { jsonLdScript } from "@/lib/json-ld"
import { breadcrumbJsonLd, itemListJsonLd, webPageJsonLd } from "@/lib/seo/jsonld"
// Was getPages: hubs list the SEO agent's published pages too.
// import { getPages, type PageKind } from "@/lib/seo/pages"
import type { PageKind } from "@/lib/seo/pages"
import type { LinkCard } from "@/lib/seo/links"
import { registryPages } from "@/lib/seo-agent/published-pages"
import { siteConfig } from "@/config/site"

/**
 * A hub page that lists the registry pages of one or more kinds: /tools,
 * /compare, /esignature-for and /esignature-law, files and the pages the SEO
 * agent published alike (src/lib/seo-agent/published-pages.ts). `guides`
 * adds a second list of related articles under the pages (the law hub lists
 * the blog's legal guides), and a hub with no pages yet says so. Hubs are what make the pages beneath them
 * one click from the navigation, and they give each page a parent in its
 * breadcrumb. Built from the registry, so a new page appears in its hub the
 * moment its file is added. Server-rendered and static, square corners,
 * single column on phones.
 */
export async function HubPage({ hub, kinds, path, guides = [] }: { hub: "tools" | "compare" | "useCases" | "law"; kinds: PageKind[]; path: string; guides?: LinkCard[] }) {
  const t = await getTranslations("seoPages")
  // Was: kinds.flatMap((kind) => getPages({ kind }))
  const pages = await registryPages(kinds)
  const trail = [
    { name: t("breadcrumbHome"), href: "/" },
    { name: t(`hubs.${hub}.breadcrumb`), href: path },
  ]
  const jsonLd = [
    webPageJsonLd({ path, name: t(`hubs.${hub}.h1`), description: t(`hubs.${hub}.metaDescription`, { site: siteConfig.name }), type: "CollectionPage" }),
    breadcrumbJsonLd(trail),
    itemListJsonLd(pages.map((p) => ({ name: p.breadcrumb, path: p.path }))),
  ]

  return (
    <section className="relative pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }} />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[360px] bg-glow" />
      <div className="mx-auto max-w-4xl px-4 pt-8 sm:px-6 sm:pt-12 lg:px-8">
        <BreadcrumbTrail trail={trail} />
        <h1 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{t(`hubs.${hub}.h1`)}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground sm:text-lg">{t(`hubs.${hub}.lede`)}</p>
        <Reveal as="div" className="mt-10">
          <ul className="grid gap-3 sm:grid-cols-2">
            {pages.map((p) => (
              <li key={p.path}>
                <Link href={p.path} className="group flex h-full flex-col border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-primary/5">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(`eyebrow.${p.kind}`)}</span>
                  <span className="mt-2 flex items-center justify-between gap-2 text-lg font-semibold">
                    {p.h1}
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                  <span className="mt-2 text-sm text-muted-foreground">{p.description}</span>
                </Link>
              </li>
            ))}
          </ul>
          {pages.length === 0 && <p className="border border-dashed border-border p-5 text-sm text-muted-foreground">{t("hubEmpty")}</p>}
        </Reveal>
        {guides.length > 0 && (
          <Reveal as="div" className="mt-12">
            <h2 className="text-xl font-bold tracking-tight">{t("hubGuides")}</h2>
            <ul className="mt-4 divide-y divide-border border border-border">
              {guides.map((g) => (
                <li key={g.href}>
                  <Link href={g.href} className="group flex items-start justify-between gap-4 p-4 transition-colors hover:bg-primary/5">
                    <span className="min-w-0">
                      <span className="block font-semibold">{g.name}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">{g.description}</span>
                    </span>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </div>
    </section>
  )
}
