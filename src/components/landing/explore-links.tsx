import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowRight, CheckCircle2, FileSignature, Scale, Wrench } from "lucide-react"
import { TOOL_IDS } from "@/lib/seo/pages"
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
/**
 * Homepage redesign: three square cards on a muted band. The topics as a
 * plain list; the free tools in the middle, raised and edged in the brand
 * accent with a "free, no account" tag, each tool listed with a check and a
 * button to the hub; the comparisons listed the same way. Everything is still
 * read from the page registry and rendered on the server, inside one Reveal,
 * for the reasons above. The earlier version (one list, two hub cards) is
 * kept below, commented out.
 */
export async function ExploreLinks() {
  const t = await getTranslations("explore")
  // What the product does, listed; who it is for (some two dozen audience
  // pages) is one link to its hub, so this card stays the height of the
  // others. The footer still lists every audience page.
  const solutions = getPages({ kind: "solution" })
  const audiences = getPages({ kind: "use-case" }).length
  const rank = (tool?: string) => {
    const i = tool ? TOOL_IDS.indexOf(tool as (typeof TOOL_IDS)[number]) : -1
    return i < 0 ? TOOL_IDS.length : i
  }
  const tools = getPages({ kind: "tool" }).sort((a, b) => rank(a.tool) - rank(b.tool))
  const comparisons = [...getPages({ kind: "comparison" }), ...getPages({ kind: "alternative" })]
  const card = "flex flex-col border border-border bg-background p-6"
  const checkList = (pages: typeof tools) => (
    <ul className="mt-4 space-y-2">
      {pages.map((p) => (
        <li key={p.path}>
          <Link href={p.path} className="group flex items-start gap-2 text-sm text-foreground hover:text-primary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <span className="underline-offset-4 group-hover:underline">{p.breadcrumb}</span>
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <section id="explore" className="bg-muted/40 py-20 sm:py-24">
      <Reveal className="mx-auto max-w-6xl px-6 lg:px-12">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-[2.75rem]">{t("title")}</h2>
          <p className="mt-4 text-lg text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className={card}>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" /> {t("solutions")}
            </h3>
            <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {solutions.map((p) => (
                <li key={p.path} className="flex items-start gap-2">
                  <span aria-hidden className="mt-2 h-px w-2.5 shrink-0 bg-primary" />
                  <Link href={p.path} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                    {p.breadcrumb}
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/esignature-for" className="group mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {t("audiencesAll", { count: audiences })} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>

          {/* The free tools: raised and edged in the accent. */}
          <div className={`${card} relative border-2 border-brand-accent shadow-[var(--shadow-soft-lg)] lg:-mt-3`}>
            <span className="absolute -top-3 left-6 bg-brand-accent px-2.5 py-1 text-xs font-semibold text-white">{t("toolsBadge")}</span>
            <h3 className="mt-1 flex items-center gap-2 text-lg font-semibold">
              <Wrench className="h-5 w-5 text-brand-accent-text" aria-hidden="true" /> {t("tools")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("toolsBody", { count: tools.length })}</p>
            {checkList(tools)}
            <Link href="/tools" className="mt-6 inline-flex h-11 items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover">
              {t("toolsAll")} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <div className={card}>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Scale className="h-5 w-5 text-primary" aria-hidden="true" /> {t("compare")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">{t("compareBody", { count: comparisons.length })}</p>
            {checkList(comparisons)}
            <Link href="/compare" className="group mt-6 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {t("compareAll")} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </Reveal>
    </section>
  )
}

// Was (before the homepage redesign):
// export async function ExploreLinks() {
//   const t = await getTranslations("explore")
//   const solutions = [...getPages({ kind: "solution" }), ...getPages({ kind: "use-case" })]
//   const hubs = [
//     { key: "tools", icon: Wrench, href: "/tools", count: getPages({ kind: "tool" }).length },
//     { key: "compare", icon: Scale, href: "/compare", count: getPages({ kind: "comparison" }).length + getPages({ kind: "alternative" }).length },
//   ] as const
//
//   return (
//     <section id="explore" className="border-t border-border py-20">
//       <Reveal className="mx-auto max-w-6xl px-6 lg:px-12">
//         <div className="mb-10 max-w-2xl">
//           <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h2>
//           <p className="mt-3 text-lg text-muted-foreground">{t("subtitle")}</p>
//         </div>
//         <div className="grid gap-px border border-border bg-border md:grid-cols-3">
//           <div className="bg-background p-6">
//             <h3 className="flex items-center gap-2 font-semibold">
//               <FileSignature className="h-5 w-5 text-primary" aria-hidden="true" /> {t("solutions")}
//             </h3>
//             <ul className="mt-4 grid grid-cols-1 gap-2.5">
//               {solutions.map((p) => (
//                 <li key={p.path}>
//                   <Link href={p.path} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
//                     {p.breadcrumb}
//                   </Link>
//                 </li>
//               ))}
//             </ul>
//           </div>
//           {hubs.map(({ key, icon: Icon, href, count }) => (
//             <Link key={key} href={href} className="group flex flex-col bg-background p-6 transition-colors hover:bg-primary/5">
//               <span className="flex items-center gap-2 font-semibold">
//                 <Icon className="h-5 w-5 text-primary" aria-hidden="true" /> {t(key)}
//               </span>
//               <span className="mt-3 text-sm text-muted-foreground">{t(`${key}Body`, { count })}</span>
//               <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-medium text-primary">
//                 {t(`${key}All`)} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
//               </span>
//             </Link>
//           ))}
//         </div>
//       </Reveal>
//     </section>
//   )
// }
//
