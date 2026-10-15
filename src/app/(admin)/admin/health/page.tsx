/**
 * /admin/health: the System health tab of Support & System Health.
 *
 * What is broken or about to be, in one place: the system checks (database,
 * migrations, payment and email providers, error reporting), payment
 * integration failures (stuck and failed Sign & Pay payments), email delivery
 * (invitations that never went out) and the customer issues that surface in
 * the product (declines with a reason, payment disputes). The section's other
 * tab is the moderation page that predates it (/admin/moderation), which
 * ranks the accounts behind those issues.
 *
 * Application errors themselves go to Sentry when it is configured; this page
 * says whether it is, rather than copying them.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { CheckCircle2, CircleAlert, CircleMinus } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { checkDatabase } from "@/lib/health"
import { getSchemaStatus } from "@/lib/schema-status"
import { loadHealthCounts, loadHealthLists, providerConfig } from "@/lib/admin/health-data"
import { AdminPageHeader, Empty, money, Panel, StatGrid, StatTile } from "@/components/admin/admin-ui"

type Check = { key: string; state: "ok" | "off" | "bad"; detail?: string }

export default async function AdminHealthPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.health")
  const format = await getFormatter()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })

  const [database, schema, counts, lists, declines] = await Promise.all([
    checkDatabase(() => prisma.$queryRaw`SELECT 1`),
    getSchemaStatus(),
    loadHealthCounts(),
    loadHealthLists(),
    prisma.recipient.findMany({
      where: { signingStatus: "REJECTED", rejectionReason: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, rejectionReason: true, updatedAt: true, document: { select: { title: true, user: { select: { email: true } } } } },
    }),
  ])
  const config = providerConfig()

  const checks: Check[] = [
    { key: "database", state: database.ok ? "ok" : "bad", detail: t("latency", { ms: database.latencyMs }) },
    { key: "migrations", state: schema.aligned === null ? "off" : schema.aligned ? "ok" : "bad", detail: schema.pending ? t("pending", { count: schema.pending }) : undefined },
    { key: "stripe", state: config.stripe ? (config.stripeWebhook ? "ok" : "bad") : "off", detail: config.stripe && !config.stripeWebhook ? t("noWebhook") : undefined },
    { key: "paystack", state: config.paystack ? "ok" : "off" },
    { key: "email", state: config.email ? "ok" : "bad" },
    { key: "sentry", state: config.sentry ? "ok" : "off" },
  ]
  const icon = { ok: CheckCircle2, off: CircleMinus, bad: CircleAlert }
  const tone = { ok: "text-emerald-600 dark:text-emerald-400", off: "text-muted-foreground", bad: "text-destructive" }

  const failedAmount = (data: unknown) => {
    const d = data as { amount?: number; currency?: string; reason?: string } | null
    return [d?.amount !== undefined && d.currency ? money(d.amount, d.currency) : null, d?.reason ?? null].filter(Boolean).join(", ")
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { version: siteConfig.version })} />

      <StatGrid>
        <StatTile label={t("stuck")} value={counts.stuckPayments} tone={counts.stuckPayments > 0 ? "bad" : "good"} hint={t("stuckHint")} />
        <StatTile label={t("failed")} value={counts.failedPayments7d} tone={counts.failedPayments7d > 0 ? "warn" : "default"} hint={t("failedHint")} href="/admin/revenue" />
        <StatTile label={t("undelivered")} value={counts.undeliveredInvites} tone={counts.undeliveredInvites > 0 ? "warn" : "default"} hint={t("undeliveredHint")} />
        <StatTile label={t("disputes")} value={counts.disputes30d} tone={counts.disputes30d > 0 ? "bad" : "default"} hint={t("disputesHint")} href="/admin/moderation" />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("checksTitle")} hint={t("checksHint")} flush>
          <ul className="divide-y divide-border">
            {checks.map((c) => {
              const Icon = icon[c.state]
              return (
                <li key={c.key} className="flex items-start gap-3 p-4 text-sm">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone[c.state]}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{t(`check.${c.key}.label`)}</p>
                    <p className="text-muted-foreground">{t(`check.${c.key}.${c.state}`)}{c.detail ? ` ${c.detail}` : ""}</p>
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>

        <Panel title={t("issuesTitle")} hint={t("issuesHint", { email: siteConfig.contactEmail })} flush index={3} action={<Link href="/admin/moderation" className="text-sm font-medium text-primary underline-offset-4 hover:underline">{t("openModeration")}</Link>}>
          {declines.length === 0 ? (
            <Empty>{t("noIssues")}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {declines.map((r) => (
                <li key={r.id} className="p-4 text-sm">
                  <p className="break-words">&ldquo;{r.rejectionReason}&rdquo;</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{t("declineMeta", { title: r.document.title, sender: r.document.user.email, when: when(r.updatedAt) })}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("paymentsTitle")} hint={t("paymentsHint")} flush index={4}>
          {lists.stuck.length + lists.failed.length === 0 ? (
            <Empty>{t("noPaymentFailures")}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {lists.stuck.map((p) => (
                <li key={p.id} className="p-4 text-sm">
                  <p className="font-medium">{t("stuckItem", { provider: p.provider === "STRIPE" ? "Stripe" : "Paystack", amount: money(p.amount, p.currency) })}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{t("itemMeta", { title: p.document.title, sender: p.document.user.email, when: when(p.createdAt) })}</p>
                </li>
              ))}
              {lists.failed.map((e) => (
                <li key={e.id} className="p-4 text-sm">
                  <p className="font-medium">{t("failedItem", { detail: failedAmount(e.data) || "—" })}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">{t("itemMeta", { title: e.document.title, sender: e.document.user.email, when: when(e.createdAt) })}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("emailTitle")} hint={t("emailHint")} flush index={5}>
          {lists.undelivered.length === 0 ? (
            <Empty>{config.email ? t("noUndelivered") : t("emailOff")}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {lists.undelivered.map((r) => (
                <li key={r.id} className="p-4 text-sm">
                  <p className="truncate font-medium">{r.email}</p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {t("itemMeta", { title: r.document.title, sender: r.document.user.email, when: r.document.sentAt ? when(r.document.sentAt) : "—" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  )
}
