/**
 * /admin/revenue/reconciliation: Salsox's own records against what Stripe and
 * Paystack report, for the same period as the summary tab.
 *
 * Four comparisons, each matched on the provider's reference so a payment is
 * compared with itself and nothing else (rules in src/lib/admin/revenue.ts):
 * - Sign & Pay through Stripe: Payment rows against Checkout Sessions;
 * - Sign & Pay through Paystack: Payment rows against transactions;
 * - one-time plan purchases: Purchase rows against Stripe payment intents;
 * - subscriptions: Subscription rows against Stripe's current status.
 *
 * Read only. A disagreement is listed with both sides; settling it is what
 * the e-sign cron's payment sweep (src/lib/esign/payments/reconcile.ts) and
 * the Stripe webhooks do, or a person acting on this list.
 */
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { daysAgo, parseWindow, WINDOWS } from "@/lib/admin/analytics"
import { loadRevenue } from "@/lib/admin/revenue-data"
import { reconcile, reconcileSubscriptions, type ReconIssue } from "@/lib/admin/revenue"
import { CalendarRange, CircleCheckBig, CloudOff, GitCompareArrows, Scale, ShieldCheck, TriangleAlert } from "lucide-react"
import { AdminPageHeader, Chip, Empty, money, Panel, ScrollTable, StatGrid, StatTile, WindowPicker } from "@/components/admin/admin-ui"

/** One disagreement, ready to print. */
type Row = { kind: ReconIssue["kind"]; ref: string; ours: string; theirs: string }
type Comparison = { key: string; title: string; available: boolean; reason?: string; matched: number; rows: Row[] }

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.reconciliation")
  const tc = await getTranslations("adminConsole.common")
  const days = parseWindow((await searchParams).days)
  const data = await loadRevenue(daysAgo(days))
  const { stripe, paystack } = data

  const describe = (r: { status: string; amount: number; currency: string } | undefined) => (r ? `${tc(`status.${r.status}`)}, ${money(r.amount, r.currency)}` : "—")
  const paymentRows = (issues: ReconIssue[]): Row[] =>
    issues.map((issue) => {
      const ref = "ours" in issue ? issue.ours.ref : issue.theirs.ref
      return {
        kind: issue.kind,
        ref,
        ours: describe("ours" in issue ? issue.ours : undefined),
        theirs: describe("theirs" in issue ? issue.theirs : undefined),
      }
    })
  const ours = (provider: "STRIPE" | "PAYSTACK") =>
    data.payments.filter((p) => p.provider === provider).map((p) => ({ id: p.id, ref: p.providerRef, status: p.status, amount: p.amount, currency: p.currency }))
  const skipped = (key: string, title: string, report: { state: "notConfigured" } | { state: "error"; message: string }): Comparison => ({
    key,
    title,
    available: false,
    reason: report.state === "notConfigured" ? t("notConfigured") : t("unreachable", { message: report.state === "error" ? report.message : "" }),
    matched: 0,
    rows: [],
  })

  const comparisons: Comparison[] = []
  if (stripe.state === "ok") {
    const signAndPay = reconcile(ours("STRIPE"), stripe.signAndPay)
    comparisons.push({ key: "stripe", title: t("stripeSignAndPay"), available: true, matched: signAndPay.matched, rows: paymentRows(signAndPay.issues) })
  } else comparisons.push(skipped("stripe", t("stripeSignAndPay"), stripe))
  if (paystack.state === "ok") {
    const signAndPay = reconcile(ours("PAYSTACK"), paystack.transactions)
    comparisons.push({ key: "paystack", title: t("paystackSignAndPay"), available: true, matched: signAndPay.matched, rows: paymentRows(signAndPay.issues) })
  } else comparisons.push(skipped("paystack", t("paystackSignAndPay"), paystack))
  if (stripe.state === "ok") {
    const purchases = reconcile(
      data.purchases.map((p) => ({ id: p.id, ref: p.stripePaymentIntentId, status: p.status === "COMPLETED" ? ("PAID" as const) : ("REFUNDED" as const), amount: p.amount, currency: p.currency })),
      stripe.purchases
    )
    comparisons.push({ key: "purchases", title: t("purchases"), available: true, matched: purchases.matched, rows: paymentRows(purchases.issues) })
    const subs = reconcileSubscriptions(
      data.subscriptions.map((s) => ({ ref: s.stripeSubscriptionId, status: s.status })),
      stripe.subscriptions.map((s) => ({ ref: s.id, status: s.status }))
    )
    comparisons.push({
      key: "subscriptions",
      title: t("subscriptions"),
      available: true,
      matched: subs.matched,
      rows: subs.issues.map((i) => ({ kind: i.kind, ref: i.ref, ours: i.ours ?? "—", theirs: i.theirs ?? "—" })),
    })
  } else {
    comparisons.push(skipped("purchases", t("purchases"), stripe))
    comparisons.push(skipped("subscriptions", t("subscriptions"), stripe))
  }

  const totalIssues = comparisons.reduce((n, c) => n + c.rows.length, 0)
  const totalMatched = comparisons.reduce((n, c) => n + c.matched, 0)
  const unavailable = comparisons.filter((c) => !c.available).length

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { days })} icon={Scale}>
        <WindowPicker path="/admin/revenue/reconciliation" current={days} windows={WINDOWS} label={tc("period")} format={(d) => tc("days", { days: d })} />
      </AdminPageHeader>

      <StatGrid>
        <StatTile label={t("matched")} value={totalMatched} tone="good" icon={CircleCheckBig} meter={totalMatched + totalIssues ? totalMatched / (totalMatched + totalIssues) : null} />
        <StatTile label={t("issuesLabel")} value={totalIssues} tone={totalIssues === 0 ? "good" : "bad"} icon={TriangleAlert} />
        <StatTile label={t("unavailable")} value={unavailable} tone={unavailable > 0 ? "warn" : "default"} icon={CloudOff} />
        <StatTile label={t("periodLabel")} value={tc("days", { days })} icon={CalendarRange} />
      </StatGrid>

      {comparisons.map((c, i) => (
        <Panel
          key={c.key}
          title={c.title}
          hint={c.available ? t("summary", { matched: c.matched, issues: c.rows.length }) : undefined}
          action={c.available ? <Chip tone={c.rows.length === 0 ? "good" : "bad"}>{c.rows.length === 0 ? t("agrees") : t("disagrees", { count: c.rows.length })}</Chip> : <Chip tone="warn">{t("skipped")}</Chip>}
          flush
          index={i + 2}
          icon={GitCompareArrows}
          iconTone={!c.available ? "warn" : c.rows.length === 0 ? "good" : "bad"}
        >
          {!c.available ? (
            <Empty icon={CloudOff}>{c.reason}</Empty>
          ) : c.rows.length === 0 ? (
            <Empty icon={ShieldCheck}>{t("noIssues")}</Empty>
          ) : (
            <ScrollTable minWidth="40rem">
              <thead>
                <tr>
                  <th>{t("issue")}</th>
                  <th>{t("reference")}</th>
                  <th>{t("ours")}</th>
                  <th>{t("theirs")}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows.slice(0, 50).map((row, n) => (
                  <tr key={`${row.ref}-${n}`}>
                    <td>
                      <Chip tone={row.kind === "missingInRecords" || row.kind === "statusMismatch" ? "bad" : "warn"}>{t(`kind.${row.kind}`)}</Chip>
                    </td>
                    {/* The provider's reference, to search for in its dashboard. */}
                    <td className="max-w-[14rem] truncate font-mono text-xs">{row.ref}</td>
                    <td>{row.ours}</td>
                    <td>{row.theirs}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </Panel>
      ))}

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  )
}
