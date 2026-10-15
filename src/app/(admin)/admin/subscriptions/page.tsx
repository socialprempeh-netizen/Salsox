/**
 * /admin/subscriptions: the Subscriptions & Plans section.
 *
 * The plans on offer and who is on each, then movement over a chosen period:
 * new subscriptions, upgrades and downgrades (from Stripe's subscription
 * events, since our database keeps only the current plan), scheduled and
 * completed cancellations, and accounts in trouble (past due, unpaid).
 *
 * Plan prices are in PLAN_CURRENCY, the currency the Stripe prices were
 * created in (src/lib/stripe-plan-prices.ts).
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { monthlyEquivalent } from "@/lib/metrics"
import { PLAN_CURRENCY } from "@/lib/stripe-plan-prices"
import { classifyPlanChange, daysAgo, parseWindow, WINDOWS } from "@/lib/admin/analytics"
import { stripePlanChanges } from "@/lib/admin/provider-reports"
import { AdminPageHeader, Chip, Empty, money, Panel, ScrollTable, StatGrid, StatTile, WindowPicker, type Tone } from "@/components/admin/admin-ui"

const STATUS_TONE: Record<string, Tone> = { ACTIVE: "good", TRIALING: "default", PAST_DUE: "bad", UNPAID: "bad", CANCELED: "warn", INCOMPLETE: "warn" }

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const ta = await getTranslations("admin")
  const t = await getTranslations("adminConsole.subscriptions")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()
  const days = parseWindow((await searchParams).days)
  const since = daysAgo(days)
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium" })

  const [plans, subscriptions, purchases, changes] = await Promise.all([
    prisma.plan.findMany({ orderBy: [{ isActive: "desc" }, { price: "asc" }] }),
    prisma.subscription.findMany({ include: { plan: true, user: { select: { email: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.purchase.count({ where: { createdAt: { gte: since }, status: "COMPLETED" } }),
    stripePlanChanges(since),
  ])

  const byStatus = (...statuses: string[]) => subscriptions.filter((s) => statuses.includes(s.status))
  const active = byStatus("ACTIVE")
  const scheduled = active.filter((s) => s.cancelAtPeriodEnd)
  const started = subscriptions.filter((s) => s.createdAt >= since)
  const canceled = subscriptions.filter((s) => s.status === "CANCELED" && s.updatedAt >= since)
  const trouble = byStatus("PAST_DUE", "UNPAID")

  const subscribers = (planId: string) => subscriptions.filter((s) => s.planId === planId && (s.status === "ACTIVE" || s.status === "TRIALING")).length
  const priced = plans.map((p) => ({ stripePriceId: p.stripePriceId, price: p.price, interval: p.interval }))
  const planName = (priceId: string) => plans.find((p) => p.stripePriceId === priceId)?.name ?? priceId
  const emailBySub = new Map(subscriptions.map((s) => [s.stripeSubscriptionId, s.user.email]))
  const classified = changes.state === "ok" ? changes.changes.map((c) => ({ ...c, kind: classifyPlanChange(c.fromPriceId, c.toPriceId, priced) })) : []
  const upgrades = classified.filter((c) => c.kind === "upgrade").length
  const downgrades = classified.filter((c) => c.kind === "downgrade").length

  // Movement in the period, newest first: starts, plan changes, cancellations.
  const movement = [
    ...started.map((s) => ({ key: `start-${s.id}`, at: s.createdAt, email: s.user.email, what: t("started", { plan: s.plan.name }), tone: "good" as Tone, label: undefined as string | undefined })),
    ...classified.map((c) => ({
      key: `change-${c.subscriptionId}-${c.at.getTime()}`,
      at: c.at,
      email: emailBySub.get(c.subscriptionId) ?? c.subscriptionId,
      what: t("changed", { from: planName(c.fromPriceId), to: planName(c.toPriceId) }),
      tone: (c.kind === "upgrade" ? "good" : c.kind === "downgrade" ? "warn" : "default") as Tone,
      label: c.kind ? t(`change.${c.kind}`) : undefined,
    })),
    ...canceled.map((s) => ({ key: `cancel-${s.id}`, at: s.updatedAt, email: s.user.email, what: t("canceledOn", { plan: s.plan.name }), tone: "bad" as Tone, label: undefined })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 30)

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { days })}>
        <WindowPicker path="/admin/subscriptions" current={days} windows={WINDOWS} label={tc("period")} format={(d) => tc("days", { days: d })} />
      </AdminPageHeader>

      <StatGrid>
        <StatTile label={ta("activeSubscriptions")} value={active.length} hint={t("trialing", { count: byStatus("TRIALING").length })} tone="good" />
        <StatTile label={t("newLabel")} value={started.length} hint={t("oneTime", { count: purchases })} />
        <StatTile
          label={t("upgradesLabel")}
          value={changes.state === "ok" ? `${upgrades} / ${downgrades}` : "—"}
          hint={changes.state === "ok" ? t("upgradesHint") : changes.state === "notConfigured" ? tc("notConfigured") : tc("unreachable")}
        />
        <StatTile label={t("cancellations")} value={canceled.length} hint={t("scheduled", { count: scheduled.length })} tone={canceled.length > 0 ? "warn" : "default"} />
      </StatGrid>

      <Panel title={t("plansTitle")} hint={t("plansHint")} flush>
        {plans.length === 0 ? (
          <Empty>{t("noPlans")}</Empty>
        ) : (
          <ScrollTable minWidth="34rem">
            <thead>
              <tr>
                <th>{t("plan")}</th>
                <th>{t("billing")}</th>
                <th className="!text-right">{t("price")}</th>
                <th className="!text-right">{t("subscribers")}</th>
                <th className="!text-right">{t("mrr")}</th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">
                    {p.name} {!p.isActive && <Chip>{t("retired")}</Chip>}
                  </td>
                  <td className="text-muted-foreground">{t(`interval.${p.interval}`)}</td>
                  <td className="text-right tabular-nums">{money(p.price, PLAN_CURRENCY)}</td>
                  <td className="text-right tabular-nums">{subscribers(p.id)}</td>
                  <td className="text-right tabular-nums">{money(active.filter((s) => s.planId === p.id).reduce((n, s) => n + monthlyEquivalent(s.plan), 0), PLAN_CURRENCY)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("movementTitle")} hint={t("movementHint")} flush index={3}>
          {movement.length === 0 ? (
            <Empty>{t("noMovement")}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {movement.map((m) => (
                <li key={m.key} className="flex items-start justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.email}</p>
                    <p className="text-muted-foreground">{m.what}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    {m.label && <Chip tone={m.tone}>{m.label}</Chip>}
                    <span className="text-xs text-muted-foreground">{when(m.at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={t("attentionTitle")} hint={t("attentionHint")} flush index={4}>
          {trouble.length + scheduled.length === 0 ? (
            <Empty>{t("noAttention")}</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {[...trouble, ...scheduled].map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 p-4 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.user.email}</p>
                    <p className="text-muted-foreground">
                      {s.plan.name}, {s.cancelAtPeriodEnd ? t("endsOn", { date: when(s.currentPeriodEnd) }) : t("periodEnd", { date: when(s.currentPeriodEnd) })}
                    </p>
                  </div>
                  <Chip tone={s.cancelAtPeriodEnd && s.status === "ACTIVE" ? "warn" : STATUS_TONE[s.status]}>
                    {s.cancelAtPeriodEnd && s.status === "ACTIVE" ? t("cancelling") : tc(`subStatus.${s.status}`)}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
