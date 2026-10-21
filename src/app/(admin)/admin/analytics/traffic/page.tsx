/**
 * /admin/analytics/traffic: the Traffic tab of the Analytics section, read
 * from Google Analytics 4 through its Data API (src/lib/admin/ga-data.ts).
 *
 * Visitors per day for a chosen range (last 30 days by default), top pages,
 * traffic sources, visitors by device (most signers are on phones, so the
 * mobile share is the headline), and the app's own conversion events as GA
 * saw them. The Growth tab beside it counts signups from the app's database,
 * which is complete; this one sees only what GA was allowed to measure.
 *
 * GA runs behind a consent banner in Consent Mode, so visitors who decline
 * cookies are missing from these reports: the page says so at the top,
 * where it cannot be missed.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { Eye, Globe2, LineChart, MonitorSmartphone, MousePointerClick, Settings2, ShieldAlert, TriangleAlert, UserPlus, Users } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { CACHE_SECONDS, trafficReport } from "@/lib/admin/ga-data"
import { isoDay, resolveRange, TRAFFIC_PRESETS } from "@/lib/admin/traffic"
// The consent caveat is a StatusBanner now (was an AdminReveal block).
// import { AdminReveal } from "@/components/admin/admin-reveal"
import { AdminPageHeader, Empty, Panel, ScrollTable, StatGrid, StatTile, StatusBanner } from "@/components/admin/admin-ui"
import { ShareBars } from "@/components/admin/share-bars"
import { TrafficChart } from "@/components/admin/traffic-chart"
import { TrafficRangePicker } from "@/components/admin/traffic-range-picker"

const PATH = "/admin/analytics/traffic"
const DEVICES = ["mobile", "desktop", "tablet", "smart tv"] as const

export default async function AdminTrafficPage({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.traffic")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()

  const range = resolveRange(await searchParams)
  const report = await trafficReport(range)
  const day = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  const num = (n: number) => format.number(n)
  const pct = (n: number) => `${Math.round(n * 100)}%`

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { start: day(range.start), end: day(range.end) })} icon={Globe2}>
        <TrafficRangePicker
          key={`${range.start}-${range.end}`}
          path={PATH}
          presets={TRAFFIC_PRESETS}
          current={range.preset}
          start={range.start}
          end={range.end}
          today={isoDay(new Date())}
          labels={{
            period: tc("period"),
            days: Object.fromEntries(TRAFFIC_PRESETS.map((d) => [d, tc("days", { days: d })])),
            custom: t("custom"),
            from: t("from"),
            to: t("to"),
            apply: t("apply"),
          }}
        />
      </AdminPageHeader>

      {/* The consent caveat, before any figure. */}
      <StatusBanner tone="warn" icon={ShieldAlert} title={t("consentTitle")}>
        {t("consentBody")}
      </StatusBanner>

      {report.state === "notConfigured" && (
        <Panel title={t("setupTitle")} hint={t("setupHint")} icon={Settings2} iconTone="warn">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {report.missing.includes("key") && <li>{t("setupKey")}</li>}
            {report.missing.includes("key") && <li>{t("setupAccess")}</li>}
            {report.missing.includes("property") && <li>{t("setupProperty")}</li>}
            <li>{t("setupRedeploy")}</li>
          </ol>
        </Panel>
      )}

      {report.state === "error" && (
        <Panel title={t("errorTitle")} hint={t("errorHint")} icon={TriangleAlert} iconTone="bad">
          <p className="break-words font-mono text-xs text-destructive">{report.message}</p>
        </Panel>
      )}

      {report.state === "ok" && (
        <>
          <StatGrid index={2}>
            <StatTile label={t("visitors")} value={num(report.totals.visitors)} hint={t("visitorsHint")} icon={Users} />
            <StatTile label={t("sessions")} value={num(report.totals.sessions)} hint={t("engagement", { rate: pct(report.totals.engagementRate) })} icon={MousePointerClick} meter={report.totals.engagementRate} />
            <StatTile label={t("pageViews")} value={num(report.totals.pageViews)} hint={report.totals.sessions ? t("perSession", { n: (report.totals.pageViews / report.totals.sessions).toFixed(1) }) : undefined} icon={Eye} />
            <StatTile
              label={t("signups")}
              value={num(report.events.sign_up)}
              hint={report.events.sign_up || report.events.document_sent ? t("documentsSent", { count: report.events.document_sent }) : t("noEvents")}
              tone="accent"
              icon={UserPlus}
            />
          </StatGrid>

          <div className="grid gap-6 lg:grid-cols-5">
            <Panel title={t("chartTitle")} hint={t("chartHint")} className="lg:col-span-3" index={3} icon={LineChart}>
              <TrafficChart data={report.series} labels={{ visitors: t("visitorsLower"), sessions: t("sessionsLower"), date: t("date") }} />
            </Panel>

            <Panel title={t("devicesTitle")} hint={t("devicesHint")} className="lg:col-span-2" index={4} icon={MonitorSmartphone}>
              {report.devices.length === 0 ? (
                <Empty>{t("noData")}</Empty>
              ) : (
                <ShareBars
                  rows={report.devices.map((d) => ({
                    key: d.label,
                    label: (DEVICES as readonly string[]).includes(d.label) ? t(`device.${d.label === "smart tv" ? "tv" : d.label}`) : d.label,
                    value: num(d.value),
                    share: d.share,
                  }))}
                />
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={t("pagesTitle")} hint={t("pagesHint")} flush index={5} icon={Eye}>
              {report.pages.length === 0 ? (
                <Empty>{t("noData")}</Empty>
              ) : (
                <ScrollTable minWidth="18rem">
                  <thead>
                    <tr>
                      <th>{t("page")}</th>
                      <th className="!text-right">{t("views")}</th>
                      <th className="!text-right">{t("visitors")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.pages.map((p) => (
                      <tr key={p.path}>
                        <td className="max-w-[9rem] truncate font-mono text-xs sm:max-w-[16rem]" title={p.path}>{p.path}</td>
                        <td className="text-right tabular-nums">{num(p.views)}</td>
                        <td className="text-right tabular-nums">{num(p.visitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ScrollTable>
              )}
            </Panel>

            <Panel title={t("sourcesTitle")} hint={t("sourcesHint")} flush index={6} icon={Globe2}>
              {report.sources.length === 0 ? (
                <Empty>{t("noData")}</Empty>
              ) : (
                <ScrollTable minWidth="18rem">
                  <thead>
                    <tr>
                      <th>{t("source")}</th>
                      <th className="!text-right">{t("sessions")}</th>
                      <th className="!text-right">{t("share")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.sources.map((s) => (
                      <tr key={s.label}>
                        <td className="max-w-[9rem] truncate sm:max-w-[16rem]" title={s.label}>{s.label}</td>
                        <td className="text-right tabular-nums">{num(s.value)}</td>
                        <td className="text-right tabular-nums">{pct(s.share)}</td>
                      </tr>
                    ))}
                  </tbody>
                </ScrollTable>
              )}
            </Panel>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("footnote", { minutes: CACHE_SECONDS / 60, time: format.dateTime(new Date(report.fetchedAt), { hour: "numeric", minute: "2-digit" }) })}
          </p>
        </>
      )}
    </div>
  )
}
