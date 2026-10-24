/**
 * The affiliate program: a join form for users who have not joined yet, and
 * for affiliates their link builder, the last 30 days of clicks and signups,
 * and the accounts they brought. The rules are in src/lib/affiliates.ts;
 * this page only shows them.
 */
import { getFormatter, getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { affiliateDashboard } from "@/lib/affiliates-store"
import { AFFILIATE_COMMISSION, AFFILIATE_COOKIE_DAYS, AFFILIATE_DESTINATIONS, claimableAffiliateCode } from "@/lib/affiliates"
import { AffiliateJoin } from "@/components/dashboard/affiliate-join"
import { AffiliateDashboardView } from "@/components/dashboard/affiliate-dashboard"

export async function generateMetadata() {
  const t = await getTranslations("dashboard.affiliate")
  return { title: t("metaTitle") }
}

export default async function AffiliatePage() {
  const user = await requireUser()
  const t = await getTranslations("dashboard.affiliate")
  const format = await getFormatter()
  const dashboard = await affiliateDashboard(user.id)
  const host = new URL(siteConfig.url).host

  if (!dashboard) {
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true } })
    // A starting suggestion from the user's name; they can change it.
    const fromName = (row?.name ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24)
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t("joinTitle")}</h1>
          <p className="mt-1 text-muted-foreground">{t("joinSubtitle", { days: AFFILIATE_COOKIE_DAYS, ...AFFILIATE_COMMISSION })}</p>
        </div>
        <AffiliateJoin host={host} suggestion={claimableAffiliateCode(fromName) ? fromName : ""} />
      </div>
    )
  }

  const pct = (n: number | null) => (n === null ? "–" : `${format.number(n, { maximumFractionDigits: 1 })}%`)
  // Commission is stored in minor units; every currency we charge in has two decimals.
  const money = (minor: number, currency: string) => format.number(minor / 100, { style: "currency", currency: currency.toUpperCase() })
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle", { days: dashboard.days })}</p>
      </div>
      <AffiliateDashboardView
        baseUrl={siteConfig.url}
        code={dashboard.code}
        active={dashboard.active}
        destinations={[...AFFILIATE_DESTINATIONS]}
        totals={{ ...dashboard.totals, conversionLabel: pct(dashboard.totals.conversion) }}
        allTime={dashboard.allTime}
        terms={AFFILIATE_COMMISSION}
        earnings={dashboard.earnings.map((e) => ({ currency: e.currency, earned: money(e.earned, e.currency), unpaid: money(e.unpaid, e.currency) }))}
        series={dashboard.series}
        recent={dashboard.recent.map((r) => ({ id: r.id, name: r.name, joined: format.dateTime(r.joinedAt, { dateStyle: "medium" }), paying: r.paying }))}
        contactEmail={siteConfig.contactEmail}
      />
    </div>
  )
}
