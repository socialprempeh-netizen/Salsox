/**
 * Invite people: the user's invite link, the free Pro time it has earned
 * them, and who has joined through it. The rules are in src/lib/referrals.ts;
 * this page only shows them.
 */
import { getFormatter, getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { referralSummary } from "@/lib/referrals-store"
import { REFERRAL_COOKIE_DAYS, REFERRAL_MAX_MONTHS_AHEAD, REFERRAL_REWARD_MONTHS, referralLink } from "@/lib/referrals"
import { siteConfig } from "@/config/site"
import { ReferralPanel } from "@/components/dashboard/referral-panel"

export async function generateMetadata() {
  const t = await getTranslations("dashboard.referrals")
  return { title: t("metaTitle") }
}

export default async function ReferralsPage() {
  const user = await requireUser()
  const t = await getTranslations("dashboard.referrals")
  const format = await getFormatter()
  const summary = await referralSummary(user.id)
  const now = new Date()
  const running = summary.proUntil && summary.proUntil > now ? summary.proUntil : null
  // Whole days of free time left, for the bar against the cap.
  const daysLeft = running ? Math.ceil((running.getTime() - now.getTime()) / 86_400_000) : 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle", { months: REFERRAL_REWARD_MONTHS })}</p>
      </div>
      <ReferralPanel
        link={referralLink(summary.code, siteConfig.url)}
        siteName={siteConfig.name}
        proUntil={running ? format.dateTime(running, { dateStyle: "long" }) : null}
        daysLeft={daysLeft}
        capDays={REFERRAL_MAX_MONTHS_AHEAD * 30}
        rewardMonths={REFERRAL_REWARD_MONTHS}
        cookieDays={REFERRAL_COOKIE_DAYS}
        capMonths={REFERRAL_MAX_MONTHS_AHEAD}
        invited={summary.invited.map((i) => ({
          id: i.id,
          name: i.name,
          joined: format.dateTime(i.joinedAt, { dateStyle: "medium" }),
          active: i.status === "active",
        }))}
      />
    </div>
  )
}
