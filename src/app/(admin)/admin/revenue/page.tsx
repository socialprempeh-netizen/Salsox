/**
 * /admin/revenue: Revenue & Payments.
 *
 * For a chosen period (7, 30 or 90 days): Salsox's revenue by kind, MRR, the
 * Sign & Pay volume that passed through for senders, what Stripe and Paystack
 * each report (revenue, fees, refunds, payouts or settlements), failed and
 * recent transactions, a per-currency breakdown, and the headline of the
 * reconciliation (its detail is the next tab).
 *
 * The rules that keep the figures honest live in src/lib/admin/revenue.ts and
 * are tested there: amounts stay per currency, Stripe and Paystack are never
 * summed with each other's reports or with our records, a payment counts once,
 * and a total across currencies appears only when ADMIN_FX_RATES gives one
 * rate table covering every currency on the page. Where each figure comes from
 * is documented in revenue-data.ts.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { daysAgo, parseWindow, WINDOWS } from "@/lib/admin/analytics"
import { loadRevenue } from "@/lib/admin/revenue-data"
import { convertTotals, currenciesOf, reconcile, type CurrencyTotals } from "@/lib/admin/revenue"
import type { ProviderReport } from "@/lib/admin/provider-reports"
import { Banknote, CircleDollarSign, Coins, CreditCard, FileSignature, Landmark, ListOrdered, Repeat, Scale, TriangleAlert, Wallet } from "lucide-react"
import { AdminPageHeader, Chip, CurrencyAmounts, Empty, money, Panel, ScrollTable, StatGrid, StatTile, WindowPicker } from "@/components/admin/admin-ui"

export default async function AdminRevenuePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.revenue")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()
  const days = parseWindow((await searchParams).days)
  const data = await loadRevenue(daysAgo(days))
  const { stripe, paystack, volume, revenue } = data
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })
  const none = tc("none")

  const converted = convertTotals(revenue.total, data.fx)

  // Headline of the reconciliation, from the same data as its tab.
  const issues =
    (stripe.state === "ok"
      ? reconcile(
          data.payments.filter((p) => p.provider === "STRIPE").map((p) => ({ id: p.id, ref: p.providerRef, status: p.status, amount: p.amount, currency: p.currency })),
          stripe.signAndPay
        ).issues.length
      : 0) +
    (paystack.state === "ok"
      ? reconcile(
          data.payments.filter((p) => p.provider === "PAYSTACK").map((p) => ({ id: p.id, ref: p.providerRef, status: p.status, amount: p.amount, currency: p.currency })),
          paystack.transactions
        ).issues.length
      : 0)
  const reconciled = stripe.state === "ok" || paystack.state === "ok"

  const failedRecorded = data.payments.filter((p) => p.status === "FAILED")
  const failedCount = failedRecorded.length + (stripe.state === "ok" ? stripe.failedCharges.length : 0) + (paystack.state === "ok" ? paystack.failed.length : 0)

  const providerState = (report: ProviderReport<object>) =>
    report.state === "ok" ? (
      <span className="flex flex-wrap gap-1.5">
        <Chip tone={report.live ? "good" : "warn"}>{report.live ? tc("liveMode") : tc("testMode")}</Chip>
        {report.truncated && <Chip tone="warn">{tc("truncated")}</Chip>}
      </span>
    ) : report.state === "notConfigured" ? (
      <Chip>{tc("notConfigured")}</Chip>
    ) : (
      <Chip tone="bad">{tc("unreachable")}</Chip>
    )

  const providerProblem = (report: ProviderReport<object>) =>
    report.state === "notConfigured" ? <Empty icon={Landmark}>{t("providerNotConfigured")}</Empty> : report.state === "error" ? <Empty icon={TriangleAlert}>{t("providerError", { message: report.message })}</Empty> : null

  const row = (label: string, totals: CurrencyTotals, hint?: string) => (
    <tr key={label}>
      <td>
        <span className="font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </td>
      <td className="text-right">
        <CurrencyAmounts totals={totals} empty={none} className="items-end" />
      </td>
    </tr>
  )

  // Recent transactions, from our records: Sign & Pay payments and one-time purchases.
  const recent = [
    ...data.payments.map((p) => ({
      id: p.id,
      at: p.paidAt ?? p.createdAt,
      kind: t("kindSignAndPay"),
      provider: p.provider === "STRIPE" ? "Stripe" : "Paystack",
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      who: p.document.user.email,
      what: p.document.title,
      href: undefined as string | undefined,
    })),
    ...data.purchases.map((p) => ({
      id: p.id,
      at: p.createdAt,
      kind: t("kindOneTime"),
      provider: "Stripe",
      amount: p.amount,
      currency: p.currency,
      status: p.status === "COMPLETED" ? "PAID" : p.status,
      who: p.user.email,
      what: p.plan.name,
      href: undefined,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 20)

  const currencies = currenciesOf(revenue.total, volume.byProvider.STRIPE.paid, volume.byProvider.PAYSTACK.paid, volume.refunded)

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle", { days })} icon={Banknote}>
        <WindowPicker path="/admin/revenue" current={days} windows={WINDOWS} label={tc("period")} format={(d) => tc("days", { days: d })} />
      </AdminPageHeader>

      <StatGrid>
        <StatTile
          label={t("totalRevenue")}
          value={<CurrencyAmounts totals={revenue.total} empty={money(0, data.mrr.currency)} className="text-xl" />}
          hint={converted ? t("convertedTotal", { amount: money(converted.amount, converted.currency), date: converted.asOf }) : data.revenueComplete ? t("perCurrency") : t("incomplete")}
          tone={data.revenueComplete ? "default" : "warn"}
          icon={CircleDollarSign}
        />
        <StatTile label={t("mrr")} value={money(data.mrr.amount, data.mrr.currency)} hint={t("mrrHint")} tone="info" icon={Repeat} />
        <StatTile label={t("signAndPayVolume")} value={<CurrencyAmounts totals={volume.paid} empty={none} className="text-xl" />} hint={t("volumeHint")} tone="accent" icon={FileSignature} />
        <StatTile
          label={t("reconciliation")}
          value={reconciled ? (issues === 0 ? t("reconciled") : t("issues", { count: issues })) : "—"}
          tone={!reconciled ? "default" : issues === 0 ? "good" : "bad"}
          hint={t("failedCount", { count: failedCount })}
          href="/admin/revenue/reconciliation"
          icon={Scale}
        />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("byKindTitle")} hint={t("byKindHint")} flush icon={Coins}>
          <ScrollTable minWidth="18rem">
            <tbody>
              {row(t("subscription"), revenue.subscription, t("subscriptionSource"))}
              {row(t("oneTime"), revenue.oneTime, t("oneTimeSource"))}
              {row(t("platformFees"), revenue.platformFee, t("platformFeesSource"))}
              {row(t("total"), revenue.total)}
            </tbody>
          </ScrollTable>
          <p className="border-t border-border p-4 text-xs text-muted-foreground">
            {converted ? t("fxUsed", { base: converted.currency, date: converted.asOf }) : t("fxNone")}
          </p>
        </Panel>

        <Panel title={t("currencyTitle")} hint={t("currencyHint")} flush index={3} icon={Landmark}>
          {currencies.length === 0 ? (
            <Empty icon={Coins}>{t("noMoney")}</Empty>
          ) : (
            <ScrollTable minWidth="30rem">
              <thead>
                <tr>
                  <th>{t("currency")}</th>
                  <th className="!text-right">{t("revenueCol")}</th>
                  <th className="!text-right">{t("stripeVolumeCol")}</th>
                  <th className="!text-right">{t("paystackVolumeCol")}</th>
                  <th className="!text-right">{t("refundedCol")}</th>
                </tr>
              </thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c}>
                    <td className="font-medium">{c}</td>
                    <td className="text-right tabular-nums">{money(revenue.total[c] ?? 0, c)}</td>
                    <td className="text-right tabular-nums">{money(volume.byProvider.STRIPE.paid[c] ?? 0, c)}</td>
                    <td className="text-right tabular-nums">{money(volume.byProvider.PAYSTACK.paid[c] ?? 0, c)}</td>
                    <td className="text-right tabular-nums">{money(volume.refunded[c] ?? 0, c)}</td>
                  </tr>
                ))}
              </tbody>
            </ScrollTable>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("stripeTitle")} hint={t("stripeHint")} action={providerState(stripe)} flush index={4} icon={CreditCard}>
          {stripe.state === "ok" ? (
            <ScrollTable minWidth="18rem">
              <tbody>
                {row(t("stripeGross"), stripe.balance.gross, t("stripeGrossHint"))}
                {row(t("fees"), stripe.balance.fees)}
                {row(t("refunds"), stripe.balance.refunds)}
                {row(t("payouts"), stripe.balance.payouts, t("payoutsHint"))}
                {row(t("transfers"), stripe.balance.transfers, t("transfersHint"))}
                {row(t("disputes"), stripe.balance.disputes)}
                {row(t("recordedVolume"), volume.byProvider.STRIPE.paid, t("recordedCounts", { ...volume.byProvider.STRIPE.counts }))}
              </tbody>
            </ScrollTable>
          ) : (
            providerProblem(stripe)
          )}
        </Panel>

        <Panel title={t("paystackTitle")} hint={t("paystackHint")} action={providerState(paystack)} flush index={5} icon={Wallet}>
          {paystack.state === "ok" ? (
            <ScrollTable minWidth="18rem">
              <tbody>
                {row(t("paystackGross"), paystack.summary.gross, t("paystackGrossHint"))}
                {row(t("fees"), paystack.summary.fees, t("paystackFeesHint"))}
                {row(t("refunds"), paystack.refunds)}
                {row(t("settlements"), paystack.settled, t("settlementsHint", { count: paystack.settlements.length }))}
                {row(t("platformShare"), paystack.summary.platformShare)}
                {row(t("recordedVolume"), volume.byProvider.PAYSTACK.paid, t("recordedCounts", { ...volume.byProvider.PAYSTACK.counts }))}
              </tbody>
            </ScrollTable>
          ) : (
            providerProblem(paystack)
          )}
        </Panel>
      </div>

      <Panel title={t("failedTitle")} hint={t("failedHint")} flush index={6} icon={TriangleAlert} iconTone="warn">
        {failedCount === 0 ? (
          <Empty>{t("failedEmpty")}</Empty>
        ) : (
          <ScrollTable>
            <thead>
              <tr>
                <th>{t("when")}</th>
                <th>{t("source")}</th>
                <th>{t("detail")}</th>
                <th className="!text-right">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {[
                ...failedRecorded.map((p) => ({ key: p.id, at: p.createdAt, source: t("recordedSource", { provider: p.provider === "STRIPE" ? "Stripe" : "Paystack" }), detail: p.document.title, amount: p.amount, currency: p.currency })),
                ...(stripe.state === "ok" ? stripe.failedCharges.map((c) => ({ key: c.id, at: c.created, source: "Stripe", detail: c.reason ?? c.id, amount: c.amount, currency: c.currency })) : []),
                ...(paystack.state === "ok" ? paystack.failed.map((f) => ({ key: f.reference, at: f.date ?? data.since, source: "Paystack", detail: f.reason ?? f.reference, amount: f.amount, currency: f.currency })) : []),
              ]
                .sort((a, b) => b.at.getTime() - a.at.getTime())
                .slice(0, 15)
                .map((f) => (
                  <tr key={f.key}>
                    <td className="whitespace-nowrap text-muted-foreground">{when(f.at)}</td>
                    <td>{f.source}</td>
                    <td className="max-w-xs truncate">{f.detail}</td>
                    <td className="text-right tabular-nums">{money(f.amount, f.currency)}</td>
                  </tr>
                ))}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <Panel title={t("recentTitle")} hint={t("recentHint")} flush index={7} icon={ListOrdered}>
        {recent.length === 0 ? (
          <Empty icon={ListOrdered}>{t("recentEmpty")}</Empty>
        ) : (
          <ScrollTable minWidth="44rem">
            <thead>
              <tr>
                <th>{t("when")}</th>
                <th>{t("type")}</th>
                <th>{t("customer")}</th>
                <th>{t("status")}</th>
                <th className="!text-right">{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{when(r.at)}</td>
                  <td>
                    {r.kind}
                    <span className="block text-xs text-muted-foreground">{r.provider}</span>
                  </td>
                  <td className="max-w-[14rem]">
                    <span className="block truncate">{r.who}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.what}</span>
                  </td>
                  <td>
                    <Chip tone={r.status === "PAID" ? "good" : r.status === "FAILED" ? "bad" : r.status === "REFUNDED" ? "warn" : "default"}>{tc(`status.${r.status}`)}</Chip>
                  </td>
                  <td className="text-right tabular-nums">{money(r.amount, r.currency)}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">
        {t("footnote")}{" "}
        <Link href="/admin/revenue/reconciliation" className="font-medium text-primary underline-offset-4 hover:underline">
          {t("openReconciliation")}
        </Link>
      </p>
    </div>
  )
}
