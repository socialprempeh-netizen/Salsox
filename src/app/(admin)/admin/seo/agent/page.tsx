/**
 * /admin/seo/agent: the SEO agent's tab in the Analytics section
 * (src/lib/seo-agent). What it picked, what it wrote, what it published and
 * where it linked from, with Publish and Discard on each draft; the publishing
 * mode (review the first three articles, then auto-publish, or review every
 * one); the run log; and the orphan pages its weekly crawl found.
 *
 * Data is read here, on the server; the buttons are client components that
 * call src/app/actions/seo-agent.ts. Runs started from here can take a few
 * minutes (the article is written while the button waits), hence maxDuration.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { Info } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { missingSettings } from "@/lib/seo-agent/agent"
import { REVIEW_FIRST } from "@/lib/seo-agent/policy"
import { searchConsoleSite } from "@/lib/seo-agent/site"
import { countArticles, getSettings, lastFinishedRun, listOrphans, recentRuns, recentTargets } from "@/lib/seo-agent/store"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { AdminPageHeader, Chip, Empty, Panel, type Tone } from "@/components/admin/admin-ui"
import { AgentRunButtons, ArticleList, OrphanList, PublishingMode, type ArticleRow } from "@/components/admin/seo-agent-console"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const RUN_TONE: Record<string, Tone> = { ok: "good", skipped: "default", failed: "bad", running: "warn" }

async function load() {
  try {
    const [targets, runs, orphans, settings, written, lastCrawl] = await Promise.all([recentTargets(), recentRuns(), listOrphans(), getSettings(), countArticles(), lastFinishedRun("orphans")])
    return { ok: true as const, targets, runs, orphans, settings, written, lastCrawl }
  } catch (error) {
    console.error("[admin/seo-agent] could not read the agent's tables:", error instanceof Error ? error.message : error)
    return { ok: false as const }
  }
}

export default async function SeoAgentPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin.seoAgent")
  const format = await getFormatter()
  const missing = missingSettings()
  const data = await load()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")}>
        {data.ok && <AgentRunButtons canRun={missing.length === 0} />}
      </AdminPageHeader>

      <AdminReveal index={1} className="flex gap-3 border border-border border-l-2 border-l-primary bg-card p-3 text-sm">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 break-words text-muted-foreground">{t("property", { site: searchConsoleSite() })}</p>
      </AdminReveal>

      {missing.length > 0 && (
        <Panel title={t("setupTitle")} hint={t("setupHint")} index={2}>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {missing.includes("GA_SERVICE_ACCOUNT_KEY_BASE64") && <li className="break-words">{t("setupKey")}</li>}
            {missing.includes("ANTHROPIC_API_KEY") && <li className="break-words">{t("setupAnthropic")}</li>}
          </ul>
        </Panel>
      )}

      {!data.ok ? (
        <Panel title={t("dbTitle")} hint={t("dbHint")} index={2}>
          <Empty>{t("dbBody")}</Empty>
        </Panel>
      ) : (
        <>
          <Panel title={t("modeTitle")} hint={t("modeHint", { count: REVIEW_FIRST })} index={2}>
            <PublishingMode reviewEvery={data.settings.draftFirst} written={Math.min(data.written, REVIEW_FIRST)} reviewFirst={REVIEW_FIRST} />
          </Panel>

          <Panel title={t("articlesTitle")} hint={t("articlesHint")} flush index={3}>
            <ArticleList
              rows={data.targets.map(
                (target): ArticleRow => ({
                  id: target.id,
                  keyword: target.keyword,
                  status: target.status,
                  createdAt: target.createdAt.toISOString(),
                  impressions: target.impressions,
                  clicks: target.clicks,
                  position: target.position,
                  page: target.page,
                  error: target.error,
                  article: target.article
                    ? { id: target.article.id, slug: target.article.slug, title: target.article.title, description: target.article.description, autoPublished: target.article.autoPublished, links: target.article._count.links }
                    : null,
                })
              )}
            />
          </Panel>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={t("runsTitle")} hint={t("runsHint")} flush index={4}>
              {data.runs.length === 0 ? (
                <Empty>{t("noRuns")}</Empty>
              ) : (
                <ul className="divide-y divide-border">
                  {data.runs.map((r) => (
                    <li key={r.id} className="min-w-0 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip tone={RUN_TONE[r.status] ?? "default"}>{t(`runStatus.${r.status as "ok" | "skipped" | "failed" | "running"}`)}</Chip>
                        <span className="text-sm font-medium">{t(`kind.${r.kind as "daily" | "orphans"}`)}</span>
                        <span className="text-xs text-muted-foreground">{t(`trigger.${r.trigger as "cron" | "manual"}`)}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{when(r.startedAt)}</span>
                      </div>
                      {r.message && <p className="mt-1.5 break-words text-sm text-muted-foreground">{r.message}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t("orphansTitle")} hint={t("orphansHint")} flush index={5}>
              <p className="border-b border-border px-4 py-2.5 text-xs text-muted-foreground">{data.lastCrawl ? t("lastCrawl", { time: when(data.lastCrawl.startedAt) }) : t("neverCrawled")}</p>
              {data.orphans.length === 0 ? (
                data.lastCrawl ? <Empty>{t("noOrphans")}</Empty> : null
              ) : (
                <OrphanList rows={data.orphans.map((o) => ({ path: o.path, status: o.status === "REVIEWED" ? "REVIEWED" : "OPEN" }))} />
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  )
}
