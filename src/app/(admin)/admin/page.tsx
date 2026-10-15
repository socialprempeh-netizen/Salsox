/**
 * /admin: the Overview section of the admin console.
 *
 * The state of the product at a glance: users, revenue, documents and the
 * alerts that need a look, each linking to the section that answers it. The
 * page that used to live here (a users table, MRR tiles and the waitlist) was
 * split up when the console was organised into sections
 * (src/lib/admin/sections.ts): the table and waitlist are under Users, and the
 * MRR tiles and chart are below.
 *
 * Only database queries: the live Stripe and Paystack figures load on the
 * Revenue & Payments page, so this one stays quick to open.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AlertTriangle, ArrowRight, Info, OctagonAlert } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { mrrHistory, monthlyEquivalent } from "@/lib/metrics"
import { PLAN_CURRENCY } from "@/lib/stripe-plan-prices"
import { buildAlerts, type AlertSeverity } from "@/lib/admin/alerts"
import { loadHealthCounts } from "@/lib/admin/health-data"
import { daysAgo, rate } from "@/lib/admin/analytics"
import { signAndPayVolume } from "@/lib/admin/revenue"
import { RevenueChart } from "@/components/admin/revenue-chart"
import { AdminPageHeader, CurrencyAmounts, money, Panel, StatGrid, StatTile } from "@/components/admin/admin-ui"
import { cn } from "@/lib/utils"

const SEVERITY: Record<AlertSeverity, { icon: typeof Info; className: string }> = {
  critical: { icon: OctagonAlert, className: "border-destructive/40 bg-destructive/5 text-destructive" },
  warning: { icon: AlertTriangle, className: "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300" },
  info: { icon: Info, className: "border-border bg-muted/30 text-foreground" },
}

export default async function AdminOverviewPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin")
  const to = await getTranslations("adminConsole.overview")
  const tc = await getTranslations("adminConsole.common")

  const since30 = daysAgo(30)
  const [totalUsers, newUsers, subscriptions, sent30, completed30, payments30, counts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    // Every subscription, not just the active ones: the chart needs the rows
    // that have since churned to show the revenue they produced while running.
    prisma.subscription.findMany({ include: { plan: true } }),
    prisma.document.count({ where: { sentAt: { gte: since30 } } }),
    prisma.document.count({ where: { sentAt: { gte: since30 }, status: "COMPLETED" } }),
    prisma.payment.findMany({ where: { createdAt: { gte: since30 } }, select: { id: true, provider: true, amount: true, currency: true, status: true } }),
    loadHealthCounts(),
  ])

  const active = subscriptions.filter((s) => s.status === "ACTIVE")
  const mrr = active.reduce((sum, s) => sum + monthlyEquivalent(s.plan), 0)
  const completion = rate(completed30, sent30)
  const alerts = buildAlerts(counts)
  const volume = signAndPayVolume(payments30)

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <StatGrid>
        <StatTile label={t("totalUsers")} value={totalUsers} hint={to("newUsers", { count: newUsers })} href="/admin/users" />
        <StatTile label={t("mrr")} value={money(mrr, PLAN_CURRENCY)} hint={to("activeSubscriptions", { count: active.length })} href="/admin/revenue" />
        <StatTile label={to("documentsSent")} value={sent30} hint={to("completed", { count: completed30 })} href="/admin/documents" />
        <StatTile label={to("completionRate")} value={completion === null ? "—" : `${Math.round(completion * 100)}%`} hint={to("last30")} href="/admin/analytics" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title={to("alertsTitle")} hint={to("alertsHint")} className="lg:col-span-3" flush>
          {alerts.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">{to("allClear")}</p>
          ) : (
            <ul className="space-y-2 p-4">
              {alerts.map((alert) => {
                const { icon: Icon, className } = SEVERITY[alert.severity]
                return (
                  <li key={alert.key}>
                    <Link href={alert.href} className={cn("group flex items-start gap-3 border p-3 text-sm transition-colors hover:border-foreground/40", className)}>
                      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{to(`alert.${alert.key}.title`, { count: alert.count })}</span>
                        <span className="block text-muted-foreground">{to(`alert.${alert.key}.body`, { count: alert.count })}</span>
                      </span>
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel title={to("paymentsTitle")} hint={to("paymentsHint")} className="lg:col-span-2" index={3}>
          <dl className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{to("signAndPayVolume")}</dt>
              <dd className="text-right font-medium">
                <CurrencyAmounts totals={volume.paid} empty={tc("none")} className="items-end" />
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{to("paidPayments")}</dt>
              <dd className="font-medium tabular-nums">{volume.byProvider.STRIPE.counts.PAID + volume.byProvider.PAYSTACK.counts.PAID}</dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="text-muted-foreground">{to("failedPayments")}</dt>
              <dd className="font-medium tabular-nums">{volume.byProvider.STRIPE.counts.FAILED + volume.byProvider.PAYSTACK.counts.FAILED}</dd>
            </div>
          </dl>
          <Link href="/admin/revenue" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            {to("openRevenue")} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Panel>
      </div>

      <Panel title={t("revenueTitle")} hint={t("revenueSubtitle")} index={4}>
        <RevenueChart data={mrrHistory(subscriptions)} label={t("revenueTooltip")} />
      </Panel>
    </div>
  )
}
