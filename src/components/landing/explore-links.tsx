import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, FileSignature, Scale, Wrench } from "lucide-react"
import { Reveal } from "@/components/landing/reveal"
import { getPages } from "@/lib/seo/pages"

/**
 * The homepage's way into the rest of the site: the e-signature topics, the
 * free tools and the comparisons.
 *
 * It is the first step of the internal linking plan (homepage → product pages
 * → free tools → signup): the homepage is the page search engines trust most,
 * and what it links to is what they treat as important. Built from the page
 * registry (src/lib/seo/pages.ts), so a new page appears here without editing
 * this file.
 *
 * Kept light on purpose. A first version listed every page in all three
 * groups, each in its own Reveal; measured with Lighthouse on a throttled
 * phone, the extra markup and client islands cost the homepage several
 * points of Total Blocking Time. The tools and comparisons are each linked
 * from the footer on every page, so here they get one card and one link to
 * their hub, and only the solution and use-case pages are listed one by one.
 * One Reveal for the whole grid; server-rendered otherwise. Square corners,
 * one column on phones.
 */
export async function ExploreLinks() {
  const t = await getTranslations("explore")
  const solutions = [...getPages({ kind: "solution" }), ...getPages({ kind: "use-case" })]
  const hubs = [
    { key: "tools", icon: Wrench, href: "/tools", count: getPages({ kind: "tool" }).length },
    { key: "compare", icon: Scale, href: "/compare", count: getPages({ kind: "comparison" }).length + getPages({ kind: "alternative" }).length },
  ] as const

  return (
    <section id="explore" className="border-t border-border py-20">
      <Reveal className="mx-auto max-w-6xl px-6 lg:px-12">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h2>
          <p className="mt-3 text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid gap-px border border-border bg-border md:grid-cols-3">
          <div className="bg-background p-6">
            <h3 className="flex items-center gap-2 font-semibold">
              <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" /> {t("solutions")}
            </h3>
            <ul className="mt-4 grid grid-cols-1 gap-2.5">
              {solutions.map((p) => (
                <li key={p.path}>
                  <Link href={p.path} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {p.breadcrumb}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          {hubs.map(({ key, icon: Icon, href, count }) => (
            <Link key={key} href={href} className="group flex flex-col bg-background p-6 transition-colors hover:bg-primary/5">
              <span className="flex items-center gap-2 font-semibold">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" /> {t(key)}
              </span>
              <span className="mt-3 text-sm text-muted-foreground">{t(`${key}Body`, { count })}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-primary">
                {t(`${key}All`)} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </Reveal>
    </section>
  )
}
