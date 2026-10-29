/**
 * /admin/seo/agent: the SEO agent's tab in the Analytics section
 * (src/lib/seo-agent). The pages it wrote in its page mode (templates,
 * comparisons, e-signature law pages) with each one's quality gates and
 * Publish, Discard and Unpublish; the duplicate report of pages held back as
 * too close to an existing one; the publishing mode (review the first three,
 * then auto-publish, or review every one); the run log; the orphan pages its
 * weekly crawl found; and, while there are any, the blog articles its
 * earlier article mode wrote.
 *
 * Above them, the agent's state in one line (its last run and what is left
 * in its queue) and four figures: pages written, published, waiting for
 * review and orphan pages still open. When SEO_AGENT_MODE=articles turns the
 * old mode back on (policy.ts), the figures and setup follow the articles.
 *
 * Data is read here, on the server; the buttons are client components that
 * call src/app/actions/seo-agent.ts. Runs started from here can take a few
 * minutes (the article is written while the button waits), hence maxDuration.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { Bot, FileCheck2, FilePen, FileText, Files, Link2Off, ScrollText, Settings2, ShieldAlert, Unlink, DatabaseZap } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { missingSettings } from "@/lib/seo-agent/agent"
import { dailyMode, REVIEW_FIRST } from "@/lib/seo-agent/policy"
import { searchConsoleSite } from "@/lib/seo-agent/site"
import { countArticles, countWrittenPages, getSettings, lastFinishedRun, listOrphans, pageStates, recentPages, recentRuns, recentTargets } from "@/lib/seo-agent/store"
import { missingPageSettings } from "@/lib/seo-agent/page-agent"
import { CANDIDATE_KIND, storedPath } from "@/lib/seo-agent/page-draft"
// Was ALL_CANDIDATES: the queue now includes the page matrix.
import { MAX_PAGE_ATTEMPTS } from "@/lib/seo-agent/page-queue"
import { PAGE_QUEUE } from "@/lib/seo-agent/page-matrix"
import { DUPLICATE_THRESHOLD, type QualityReport } from "@/lib/seo-agent/quality"
import { fillSite } from "@/lib/seo/pages"
// The property line is part of the StatusBanner now.
// import { AdminReveal } from "@/components/admin/admin-reveal"
import { AdminPageHeader, Chip, Empty, Panel, StatGrid, StatTile, StatusBanner, Timeline, type Tone } from "@/components/admin/admin-ui"
import { AgentRunButtons, ArticleList, OrphanList, PublishingMode, type ArticleRow } from "@/components/admin/seo-agent-console"
import { DuplicateReport, GeneratedPageList, type GateRow, type PageRow } from "@/components/admin/seo-agent-pages"

export const dynamic = "force-dynamic"
export const maxDuration = 300

const RUN_TONE: Record<string, Tone> = { ok: "good", skipped: "default", failed: "bad", running: "info" }

async function load() {
  try {
    const [targets, runs, orphans, settings, articlesWritten, lastCrawl, pages, pagesWritten, states] = await Promise.all([
      recentTargets(),
      recentRuns(),
      listOrphans(),
      getSettings(),
      countArticles(),
      lastFinishedRun("orphans"),
      recentPages(),
      countWrittenPages(),
      pageStates(),
    ])
    // Candidates with nothing saved yet, or a failure with a retry left.
    const saved = new Map(states.map((s) => [`${CANDIDATE_KIND[s.kind]}:${s.slug}`, s]))
    const queueLeft = PAGE_QUEUE.filter((c) => {
      const s = saved.get(`${c.kind}:${c.slug}`)
      return !s || (s.status === "FAILED" && s.attempts < MAX_PAGE_ATTEMPTS)
    }).length
    return { ok: true as const, targets, runs, orphans, settings, articlesWritten, lastCrawl, pages, pagesWritten, queueLeft }
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
  // The page mode is the default; the article mode runs only when switched back on.
  const mode = dailyMode()
  const missing = mode === "articles" ? missingSettings() : missingPageSettings()
  const data = await load()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })
  const last = data.ok ? data.runs[0] : undefined
  const runStatus = (status: string) => t(`runStatus.${status as "ok" | "skipped" | "failed" | "running"}`)
  const runKind = (kind: string) => t(`kind.${kind as "daily" | "orphans" | "pages"}`)
  // Were the article figures alone; they still are in the article mode.
  // const published = data.ok ? data.targets.filter((x) => x.status === "PUBLISHED").length : 0
  // const drafts = data.ok ? data.targets.filter((x) => x.status === "DRAFT").length : 0
  const articles = mode === "articles"
  const published = data.ok ? (articles ? data.targets.filter((x) => x.status === "PUBLISHED").length : data.pages.filter((x) => x.status === "PUBLISHED").length) : 0
  const drafts = data.ok ? (articles ? data.targets.filter((x) => x.status === "DRAFT").length : data.pages.filter((x) => x.status === "DRAFT" || x.status === "FLAGGED").length) : 0
  const flagged = data.ok ? data.pages.filter((x) => x.status === "FLAGGED") : []
  const written = data.ok ? (articles ? data.articlesWritten : data.pagesWritten) : 0
  const pageRows: PageRow[] = data.ok
    ? data.pages.map((p) => {
        const report = p.report as QualityReport | null
        return {
          id: p.id,
          kind: p.kind,
          path: storedPath(p.kind, p.slug),
          status: p.status,
          // Stored as written, with {site} for the product name.
          title: fillSite(p.title || p.slug),
          createdAt: p.createdAt.toISOString(),
          autoPublished: p.autoPublished,
          noindex: p.noindex,
          similarity: p.similarity,
          similarTo: p.similarTo,
          threshold: p.kind === "TEMPLATE" ? DUPLICATE_THRESHOLD.template : DUPLICATE_THRESHOLD.page,
          error: p.error,
          attempts: p.attempts,
          gates: (report?.gates ?? []) as GateRow[],
        }
      })
    : []
  const openOrphans = data.ok ? data.orphans.filter((o) => o.status !== "REVIEWED").length : 0

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={articles ? t("subtitleArticles") : t("subtitle")} icon={Bot}>
        {data.ok && <AgentRunButtons canRun={missing.length === 0} />}
      </AdminPageHeader>

      {/* Was an info line with the property alone; now the last run leads it. */}
      <StatusBanner
        tone={last ? RUN_TONE[last.status] ?? "info" : "info"}
        icon={last ? undefined : Bot}
        title={last ? t("statusLast", { kind: runKind(last.kind), status: runStatus(last.status), time: when(last.startedAt) }) : t("statusNever")}
      >
        {articles ? t("property", { site: searchConsoleSite() }) : data.ok ? t("queue", { count: data.queueLeft }) : null}
      </StatusBanner>

      {data.ok && (
        <StatGrid index={2}>
          <StatTile label={articles ? t("statWrittenArticles") : t("statWritten")} value={written} hint={t("statWrittenHint", { count: REVIEW_FIRST })} tone="accent" icon={FileText} meter={Math.min(written, REVIEW_FIRST) / REVIEW_FIRST} />
          <StatTile label={t("statPublished")} value={published} hint={articles && data.targets.length > 0 ? t("statRecentHint", { count: data.targets.length }) : undefined} tone="good" icon={FileCheck2} />
          <StatTile label={t("statDrafts")} value={drafts} hint={flagged.length > 0 ? t("statFlaggedHint", { count: flagged.length }) : t("statDraftsHint")} tone={drafts > 0 ? "warn" : "default"} icon={FilePen} />
          <StatTile label={t("statOrphans")} value={openOrphans} hint={data.lastCrawl ? t("lastCrawl", { time: when(data.lastCrawl.startedAt) }) : t("statNeverCrawled")} tone={openOrphans > 0 ? "warn" : "default"} icon={Unlink} />
        </StatGrid>
      )}

      {missing.length > 0 && (
        <Panel title={t("setupTitle")} hint={t("setupHint")} index={3} icon={Settings2} iconTone="warn">
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {missing.includes("GA_SERVICE_ACCOUNT_KEY_BASE64") && <li className="break-words">{t("setupKey")}</li>}
            {missing.includes("ANTHROPIC_API_KEY") && <li className="break-words">{articles ? t("setupAnthropic") : t("setupAnthropicPages")}</li>}
          </ul>
        </Panel>
      )}

      {!data.ok ? (
        <Panel title={t("dbTitle")} hint={t("dbHint")} index={3} icon={DatabaseZap} iconTone="bad" flush>
          <Empty icon={DatabaseZap}>{t("dbBody")}</Empty>
        </Panel>
      ) : (
        <>
          <Panel title={t("modeTitle")} hint={t("modeHint", { count: REVIEW_FIRST })} index={3} icon={Settings2}>
            <PublishingMode reviewEvery={data.settings.draftFirst} written={Math.min(written, REVIEW_FIRST)} reviewFirst={REVIEW_FIRST} />
          </Panel>

          <Panel title={t("pagesTitle")} hint={t("pagesHint")} flush index={4} icon={Files} iconTone="accent" badge={<Chip>{t("pagesCount", { count: pageRows.length })}</Chip>}>
            <GeneratedPageList rows={pageRows} />
          </Panel>

          <Panel title={t("reportTitle")} hint={t("reportHint")} flush index={4} icon={ShieldAlert} iconTone={flagged.length > 0 ? "warn" : "default"} badge={flagged.length > 0 ? <Chip tone="warn">{t("reportCount", { count: flagged.length })}</Chip> : undefined}>
            <DuplicateReport rows={pageRows.filter((r) => r.status === "FLAGGED" || (r.noindex && r.status === "PUBLISHED"))} />
          </Panel>

          {/* The article mode list: shown while it is on, or while it has articles to manage. */}
          {(articles || data.targets.length > 0) && (
          <Panel title={articles ? t("articlesTitle") : t("articlesEarlierTitle")} hint={articles ? t("articlesHint") : t("articlesEarlierHint")} flush index={4} icon={FileText} iconTone="accent" badge={<Chip>{t("articlesCount", { count: data.targets.length })}</Chip>}>
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
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={t("runsTitle")} hint={t("runsHint")} flush index={5} icon={ScrollText} badge={data.runs.length > 0 ? <Chip>{t("runsCount", { count: data.runs.length })}</Chip> : undefined}>
              {data.runs.length === 0 ? (
                <Empty icon={ScrollText}>{t("noRuns")}</Empty>
              ) : (
                // Was a divided list with the status chip first on each row;
                // now a timeline whose nodes carry the status colour. Thirty
                // runs scroll inside the panel instead of stretching the page.
                <div className="max-h-[34rem] overflow-y-auto">
                  <Timeline
                    items={data.runs.map((r) => ({
                      key: r.id,
                      tone: RUN_TONE[r.status] ?? "default",
                      content: (
                        <>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium">{runKind(r.kind)}</span>
                            <Chip tone={RUN_TONE[r.status] ?? "default"}>{runStatus(r.status)}</Chip>
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {when(r.startedAt)}, {t(`trigger.${r.trigger as "cron" | "manual"}`).toLowerCase()}
                          </p>
                          {r.message && <p className="mt-1.5 break-words text-sm text-muted-foreground">{r.message}</p>}
                        </>
                      ),
                    }))}
                  />
                </div>
              )}
            </Panel>

            <Panel title={t("orphansTitle")} hint={t("orphansHint")} flush index={6} icon={Link2Off} iconTone={openOrphans > 0 ? "warn" : "default"} badge={data.orphans.length > 0 ? <Chip tone={openOrphans > 0 ? "warn" : "good"}>{t("orphansOpen", { count: openOrphans })}</Chip> : undefined}>
              <p className="border-b border-border bg-muted/25 px-4 py-2.5 text-xs text-muted-foreground sm:px-5">{data.lastCrawl ? t("lastCrawl", { time: when(data.lastCrawl.startedAt) }) : t("neverCrawled")}</p>
              {data.orphans.length === 0 ? (
                data.lastCrawl ? <Empty icon={FileCheck2}>{t("noOrphans")}</Empty> : null
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
