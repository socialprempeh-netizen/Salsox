/**
 * /admin/analytics: the Growth tab of the Analytics section.
 *
 * Signups (per week, and by the channel attribution recorded), active users,
 * conversion to paid and the document completion rate, for a chosen period,
 * plus the signup-to-paid funnel for the people who joined in it. The
 * section's other tabs are the pages that predate it: SEO health (/admin/seo)
 * and the founder's outreach tracker (/admin/outreach).
 *
 * Definitions, stated on the page as well:
 * - active: signed in (a session used) during the period;
 * - sending: sent at least one document during the period;
 * - paid: has, or had, a subscription that started (not INCOMPLETE), or
 *   completed a one-time purchase;
 * - completion rate: documents sent in the period that are now completed.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { daysAgo, median, parseWindow, rate, weeklyCounts, WINDOWS } from "@/lib/admin/analytics"
import { AdminPageHeader, Empty, Panel, ScrollTable, StatGrid, StatTile, WindowPicker } from "@/components/admin/admin-ui"
import { WeeklyBars } from "@/components/admin/weekly-bars"

const HOUR = 60 * 60 * 1000

export default async function AdminAnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.analytics")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()
  const days = parseWindow((await searchParams).days)
  const since = daysAgo(days)
  const percent = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`)

  const [totalUsers, signupDates, channels, activeSessions, sendingUsers, paidSubs, paidPurchases, sent, completedDocs, cohort] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({ where: { createdAt: { gte: daysAgo(84) } }, select: { createdAt: true } }),
    prisma.user.groupBy({ by: ["signupChannel"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.session.groupBy({ by: ["userId"], where: { updatedAt: { gte: since } } }),
    prisma.document.groupBy({ by: ["userId"], where: { sentAt: { gte: since } } }),
    prisma.subscription.findMany({ where: { status: { not: "INCOMPLETE" } }, select: { userId: true } }),
    prisma.purchase.findMany({ where: { status: "COMPLETED" }, select: { userId: true } }),
    prisma.document.count({ where: { sentAt: { gte: since } } }),
    prisma.document.findMany({ where: { sentAt: { gte: since }, status: "COMPLETED", completedAt: { not: null } }, select: { sentAt: true, completedAt: true } }),
    // The people who signed up in the period, for the funnel.
    prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { id: true, documents: { where: { sentAt: { not: null } }, select: { id: true }, take: 1 } } }),
  ])

  const paid = new Set([...paidSubs, ...paidPurchases].map((r) => r.userId))
  const signups = cohort.length
  const cohortSent = cohort.filter((u) => u.documents.length > 0).length
  const cohortPaid = cohort.filter((u) => paid.has(u.id)).length
  const hoursToSign = median(completedDocs.map((d) => (d.completedAt!.getTime() - d.sentAt!.getTime()) / HOUR))
  const weeks = weeklyCounts(signupDates.map((u) => u.createdAt), { weeks: 12 }).map((w) => ({
    label: format.dateTime(w.start, { month: "short", day: "numeric" }),
    count: w.count,
  }))
  const channelRows = channels.map((c) => ({ channel: c.signupChannel ?? "unknown", count: c._count._all })).sort((a, b) => b.count - a.count)

  const funnel = [
    { label: t("funnelSignedUp"), count: signups },
    { label: t("funnelSent"), count: cohortSent },
    { label: t("funnelPaid"), count: cohortPaid },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { days })}>
        <WindowPicker path="/admin/analytics" current={days} windows={WINDOWS} label={tc("period")} format={(d) => tc("days", { days: d })} />
      </AdminPageHeader>

      <StatGrid>
        <StatTile label={t("signups")} value={signups} hint={t("ofTotal", { total: totalUsers })} />
        <StatTile label={t("activeUsers")} value={activeSessions.length} hint={t("sendingUsers", { count: sendingUsers.length })} />
        <StatTile label={t("conversion")} value={percent(rate(paid.size, totalUsers))} hint={t("conversionHint", { paid: paid.size, total: totalUsers })} />
        <StatTile
          label={t("completionRate")}
          value={percent(rate(completedDocs.length, sent))}
          hint={hoursToSign === null ? t("completionHint", { sent }) : t("medianHours", { hours: hoursToSign < 1 ? "<1" : Math.round(hoursToSign) })}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title={t("weeklyTitle")} hint={t("weeklyHint")} className="lg:col-span-3">
          <WeeklyBars weeks={weeks} label={t("weeklyTitle")} />
        </Panel>

        <Panel title={t("funnelTitle")} hint={t("funnelHint", { days })} className="lg:col-span-2" index={3}>
          <ol className="space-y-3">
            {funnel.map((step, i) => (
              <li key={step.label}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{step.label}</span>
                  <span className="font-semibold tabular-nums">
                    {step.count}
                    {i > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{percent(rate(step.count, signups))}</span>}
                  </span>
                </div>
                <div className="mt-1 h-2 bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${signups ? (step.count / signups) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      <Panel title={t("channelsTitle")} hint={t("channelsHint")} flush index={4}>
        {channelRows.length === 0 ? (
          <Empty>{t("noSignups")}</Empty>
        ) : (
          <ScrollTable minWidth="20rem">
            <thead>
              <tr>
                <th>{t("channel")}</th>
                <th className="!text-right">{t("signups")}</th>
                <th className="!text-right">{t("share")}</th>
              </tr>
            </thead>
            <tbody>
              {channelRows.map((row) => (
                <tr key={row.channel}>
                  <td>{t.has(`channels.${row.channel}`) ? t(`channels.${row.channel}`) : row.channel}</td>
                  <td className="text-right tabular-nums">{row.count}</td>
                  <td className="text-right tabular-nums">{percent(rate(row.count, signups))}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">{t("definitions")}</p>
    </div>
  )
}
