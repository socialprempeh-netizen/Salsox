/**
 * /admin/seo: is this deployment set up to be found, and is anything broken?
 *
 * Five panels, cheapest first:
 *  - Setup: site URL, sitemap, robots.txt, Search Console and Bing
 *    verification, IndexNow, analytics. Read from configuration, instant.
 *  - Sitemap: how many URLs it submits, by section, and how fresh they are.
 *  - Content: the registry's quality rules (src/lib/seo/pages.ts) applied to
 *    the live content: duplicate intents, thin pages, broken related links.
 *  - Signups by channel over 30 days, and the landing pages organic
 *    visitors signed up from (src/lib/seo/attribution-store.ts).
 *  - Crawl, on demand (?audit=1): every sitemap URL fetched over HTTP from
 *    this deployment and audited the way a crawler sees it, plus the private
 *    pages that must stay noindex (src/lib/seo/crawl.ts). On demand because
 *    it makes one request per page.
 *
 * Search queries are not something a site can see; the page links to Search
 * Console and Bing Webmaster Tools for those. Admin only (the layout checks).
 */
import Link from "next/link"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { CheckCircle2, CircleAlert, ExternalLink, XCircle } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import sitemap from "@/app/sitemap"
import { getAllPosts } from "@/lib/blog"
import { resolveIndexNowKey } from "@/lib/indexnow"
import { getPages, loadAllPages, validatePages } from "@/lib/seo/pages"
import { crawlSite } from "@/lib/seo/crawl"
import { signupSummary } from "@/lib/seo/attribution-store"
import { GA_ID_PATTERN } from "@/components/analytics/google-analytics"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"
export const maxDuration = 120

type Status = "ok" | "warn" | "error"

function StatusIcon({ status }: { status: Status }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
  if (status === "warn") return <CircleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
}

function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <AdminReveal>
      <section className="border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        <div className="mt-4">{children}</div>
      </section>
    </AdminReveal>
  )
}

const SECTIONS: { key: string; test: (path: string) => boolean }[] = [
  { key: "tools", test: (p) => getPages({ kind: "tool" }).some((x) => x.path === p) || p === "/tools" },
  { key: "solutions", test: (p) => getPages({ kind: "solution" }).some((x) => x.path === p) },
  { key: "compare", test: (p) => p.startsWith("/compare") || p.startsWith("/alternatives") },
  { key: "useCases", test: (p) => p.startsWith("/esignature-for") },
  { key: "blog", test: (p) => p.startsWith("/blog") },
  { key: "docs", test: (p) => p.startsWith("/docs") },
]

export default async function SeoHealthPage({ searchParams }: { searchParams: Promise<{ audit?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminSeo")
  const format = await getFormatter()
  const { audit } = await searchParams

  // ── Setup ─────────────────────────────────────────────────────────────────
  const publicUrl = /^https:\/\//.test(siteConfig.url) && !/localhost|127\.0\.0\.1/.test(siteConfig.url)
  const demo = process.env.DEMO_MODE === "true"
  const setup: { label: string; status: Status; detail: string; href?: string }[] = [
    { label: t("setup.siteUrl"), status: publicUrl ? "ok" : "error", detail: publicUrl ? siteConfig.url : t("setup.siteUrlBad", { url: siteConfig.url }) },
    { label: t("setup.indexing"), status: demo ? "error" : "ok", detail: demo ? t("setup.demo") : t("setup.indexingOn") },
    { label: t("setup.sitemap"), status: demo ? "warn" : "ok", detail: `${siteConfig.url}/sitemap.xml`, href: "/sitemap.xml" },
    { label: t("setup.robots"), status: "ok", detail: `${siteConfig.url}/robots.txt`, href: "/robots.txt" },
    { label: t("setup.google"), status: process.env.GOOGLE_SITE_VERIFICATION ? "ok" : "warn", detail: process.env.GOOGLE_SITE_VERIFICATION ? t("setup.verificationSet") : t("setup.googleMissing"), href: "https://search.google.com/search-console" },
    { label: t("setup.bing"), status: process.env.BING_SITE_VERIFICATION ? "ok" : "warn", detail: process.env.BING_SITE_VERIFICATION ? t("setup.verificationSet") : t("setup.bingMissing"), href: "https://www.bing.com/webmasters" },
    { label: t("setup.indexNow"), status: resolveIndexNowKey(process.env) ? "ok" : "warn", detail: resolveIndexNowKey(process.env) ? t("setup.indexNowOn") : t("setup.indexNowOff") },
    { label: t("setup.analytics"), status: GA_ID_PATTERN.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "") ? "ok" : "warn", detail: GA_ID_PATTERN.test(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() ?? "") ? t("setup.analyticsOn") : t("setup.analyticsOff") },
  ]

  // ── Sitemap ───────────────────────────────────────────────────────────────
  const entries = sitemap()
  const paths = entries.map((e) => new URL(e.url).pathname)
  const bySection = SECTIONS.map((s) => ({ key: s.key, count: paths.filter(s.test).length }))
  const other = paths.length - bySection.reduce((a, b) => a + b.count, 0)
  const newest = entries.map((e) => (e.lastModified ? new Date(e.lastModified).getTime() : 0)).reduce((a, b) => Math.max(a, b), 0)
  const undated = entries.filter((e) => !e.lastModified).length

  // ── Content quality ───────────────────────────────────────────────────────
  const known = new Set(["/", "/pricing", "/verify", "/docs", "/blog", "/about", "/contact", "/changelog", "/tools", "/compare", ...getAllPosts().map((p) => `/blog/${p.slug}`)])
  const contentProblems = validatePages(loadAllPages(), known)

  // ── Signups ───────────────────────────────────────────────────────────────
  const signups = await signupSummary(30)

  // ── Crawl (on demand) ─────────────────────────────────────────────────────
  const h = await headers()
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`
  const crawl = audit === "1" ? await crawlSite({ origin, sitemapUrls: entries.map((e) => e.url) }) : null
  const errors = crawl?.issues.filter((i) => i.severity === "error") ?? []
  const warnings = crawl?.issues.filter((i) => i.severity === "warning") ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t("subtitle")}</p>
      </div>

      <Panel title={t("setup.title")} description={t("setup.description")}>
        <ul className="divide-y divide-border border border-border">
          {setup.map((row) => (
            <li key={row.label} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 font-medium"><StatusIcon status={row.status} /> {row.label}</span>
              {row.href ? (
                <a href={row.href} target={row.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all text-muted-foreground underline-offset-4 hover:underline">
                  {row.detail} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
              ) : (
                <span className="break-all text-muted-foreground">{row.detail}</span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t("setup.queries")}</p>
      </Panel>

      <Panel title={t("sitemap.title")} description={t("sitemap.description", { count: entries.length })}>
        <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
          {[...bySection, { key: "other", count: other }].map((s) => (
            <div key={s.key} className="bg-background p-3">
              <p className="text-2xl font-bold tabular-nums">{s.count}</p>
              <p className="text-xs text-muted-foreground">{t(`sections.${s.key}`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {newest ? t("sitemap.newest", { date: format.dateTime(new Date(newest), { dateStyle: "medium" }) }) : null} {t("sitemap.undated", { count: undated })}
        </p>
      </Panel>

      <Panel title={t("content.title")} description={t("content.description", { count: getPages().length })}>
        {contentProblems.length === 0 ? (
          <p className="flex items-center gap-2 text-sm"><StatusIcon status="ok" /> {t("content.ok")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {contentProblems.map((p) => (
              <li key={p} className="flex gap-2"><StatusIcon status="error" /> <span className="break-words">{p}</span></li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={t("signups.title")} description={t("signups.description", { days: signups.days, total: signups.total })}>
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="divide-y divide-border border border-border text-sm">
            {signups.byChannel.map((c) => (
              <li key={c.channel} className="flex items-center justify-between p-2.5">
                <span>{t(`channels.${c.channel}`)}</span>
                <span className={cn("tabular-nums", c.count === 0 && "text-muted-foreground")}>{c.count}</span>
              </li>
            ))}
          </ul>
          <div>
            <h3 className="text-sm font-semibold">{t("signups.organicPages")}</h3>
            {signups.organicLandingPages.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">{t("signups.none")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-border border border-border text-sm">
                {signups.organicLandingPages.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3 p-2.5">
                    <Link href={p.path} className="min-w-0 truncate underline-offset-4 hover:underline">{p.path}</Link>
                    <span className="tabular-nums">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      <Panel title={t("crawl.title")} description={t("crawl.description")}>
        {!crawl ? (
          <Link href="/admin/seo?audit=1" className="inline-flex h-11 items-center justify-center bg-primary px-5 text-sm font-semibold text-primary-foreground hover:opacity-90">
            {t("crawl.run", { count: entries.length })}
          </Link>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
              {[
                { label: t("crawl.pages"), value: crawl.pages.length },
                { label: t("crawl.indexable"), value: crawl.pages.filter((p) => p.status === 200 && !/noindex/i.test(`${p.robots} ${p.xRobotsTag}`)).length },
                { label: t("crawl.errors"), value: errors.length },
                { label: t("crawl.warnings"), value: warnings.length },
              ].map((s) => (
                <div key={s.label} className="bg-background p-3">
                  <p className="text-2xl font-bold tabular-nums">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("crawl.took", { seconds: (crawl.durationMs / 1000).toFixed(1) })}</p>

            {crawl.issues.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold">{t("crawl.issues")}</h3>
                <ul className="mt-2 max-h-96 divide-y divide-border overflow-y-auto border border-border text-sm">
                  {crawl.issues.map((issue, i) => (
                    <li key={i} className="flex gap-2 p-2.5">
                      <StatusIcon status={issue.severity === "error" ? "error" : "warn"} />
                      <span className="min-w-0">
                        <span className="block break-all font-medium">{issue.url.replace(siteConfig.url, "") || "/"}</span>
                        <span className="text-muted-foreground">{issue.message}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold">{t("crawl.private")}</h3>
              <ul className="mt-2 divide-y divide-border border border-border text-sm">
                {crawl.privatePages.map((p) => (
                  <li key={p.path} className="flex items-center justify-between gap-3 p-2.5">
                    <span className="flex min-w-0 items-center gap-2"><StatusIcon status={p.protected ? "ok" : "error"} /> <span className="truncate">{p.path}</span></span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.status || t("crawl.unreachable")}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold">{t("crawl.canonicals")}</h3>
              <div className="mt-2 overflow-x-auto border border-border">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead className="bg-muted/60 text-xs">
                    <tr>
                      <th className="p-2.5 font-semibold">{t("crawl.url")}</th>
                      <th className="p-2.5 font-semibold">{t("crawl.status")}</th>
                      <th className="p-2.5 font-semibold">{t("crawl.canonical")}</th>
                      <th className="p-2.5 font-semibold">{t("crawl.structured")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crawl.pages.map((p) => {
                      const canonicalOk = p.canonical?.replace(/\/+$/, "") === p.url.replace(/\/+$/, "")
                      return (
                        <tr key={p.url} className="border-t border-border">
                          <td className="max-w-[16rem] truncate p-2.5">{p.url.replace(siteConfig.url, "") || "/"}</td>
                          <td className="p-2.5 tabular-nums">{p.status}</td>
                          <td className="p-2.5"><StatusIcon status={canonicalOk ? "ok" : "error"} /></td>
                          <td className="p-2.5 text-xs text-muted-foreground">{[...new Set(p.jsonLdTypes)].join(", ") || "-"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <Link href="/admin/seo?audit=1" className="inline-flex h-10 items-center border border-border px-4 text-sm font-medium hover:bg-secondary">{t("crawl.rerun")}</Link>
          </div>
        )}
      </Panel>
    </div>
  )
}
