/**
 * /admin/revenue/affiliates: the affiliate payout queue, a tab of the Revenue
 * section.
 *
 * Lists each affiliate's cleared, unpaid commission per currency
 * (affiliatePayoutQueue, src/lib/affiliates-store.ts): cleared means past the
 * refund hold, so what is listed can no longer be reversed by a refund that
 * comes in time. A balance at or over its currency's minimum is due on the
 * next payout day (AFFILIATE_PAYOUT, src/lib/affiliates.ts). "Mark paid"
 * records a payout the admin has sent by hand; nothing here moves money.
 */
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { CalendarClock, HandCoins, Users, Wallet } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { affiliatePayoutQueue } from "@/lib/affiliates-store"
import { AFFILIATE_PAYOUT, nextPayoutDate, payoutMinimum } from "@/lib/affiliates"
import { AdminPageHeader, Chip, Empty, money, Panel, ScrollTable, StatGrid, StatTile } from "@/components/admin/admin-ui"
import { AffiliatePayoutButton } from "@/components/admin/affiliate-payout-button"

export const dynamic = "force-dynamic"

export default async function AffiliatePayoutsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.affiliatePayouts")
  const format = await getFormatter()
  const now = new Date()
  const queue = await affiliatePayoutQueue(now)
  const due = queue.filter((row) => row.due)

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} icon={HandCoins} />

      <StatGrid>
        <StatTile label={t("owed")} value={new Set(queue.map((r) => r.affiliateId)).size} icon={Users} />
        <StatTile label={t("due")} value={due.length} tone={due.length > 0 ? "warn" : "default"} icon={Wallet} />
        <StatTile label={t("nextPayout")} value={format.dateTime(nextPayoutDate(now), { dateStyle: "medium", timeZone: "UTC" })} hint={t("holdHint", { days: AFFILIATE_PAYOUT.holdDays })} icon={CalendarClock} />
      </StatGrid>

      <Panel title={t("queueTitle")} hint={t("queueHint")} flush index={2} icon={HandCoins}>
        {queue.length === 0 ? (
          <Empty icon={Wallet}>{t("empty")}</Empty>
        ) : (
          <ScrollTable minWidth="44rem">
            <thead>
              <tr>
                <th>{t("affiliate")}</th>
                <th className="text-right">{t("amount")}</th>
                <th className="text-right">{t("commissions")}</th>
                <th>{t("statusLabel")}</th>
                <th>
                  <span className="sr-only">{t("markPaid")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => {
                const amount = money(row.cleared, row.currency)
                return (
                  <tr key={`${row.affiliateId}-${row.currency}`}>
                    <td>
                      <p className="font-mono text-xs">/go/{row.code}</p>
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground">{row.name ? `${row.name} · ${row.email}` : row.email}</p>
                    </td>
                    <td className="text-right font-semibold tabular-nums">{amount}</td>
                    <td className="text-right tabular-nums">{row.rows}</td>
                    <td>
                      {row.due ? <Chip tone="good">{t("statusDue")}</Chip> : <Chip tone="warn">{t("statusUnderMinimum", { minimum: money(payoutMinimum(row.currency), row.currency) })}</Chip>}
                    </td>
                    <td>
                      <AffiliatePayoutButton affiliateId={row.affiliateId} currency={row.currency} amount={amount} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">{t("footnote")}</p>
    </div>
  )
}
