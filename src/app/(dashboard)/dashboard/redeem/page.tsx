import Link from "next/link"
import type { Metadata } from "next"
import { getFormatter, getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { appSumoConfig, tierForLicense } from "@/lib/appsumo"
import { currentAppSumoLicense } from "@/lib/appsumo-store"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RedeemPanel } from "@/components/appsumo/redeem-panel"

/**
 * /dashboard/redeem: the account's AppSumo license, and the form to redeem
 * one (src/lib/appsumo.ts). Also where a key entered before signing in lands
 * once it has been redeemed (components/appsumo/resume-pending.tsx adds
 * `?result=`).
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appsumo")
  return { title: `${t("dashTitle")} | ${siteConfig.name}` }
}

// The outcomes resumePendingRedemptionAction reports; anything else is ignored.
const RESULTS = ["redeemed", "redeemed-stopped", "invalidKey", "notFound", "deactivated", "notActivated", "takenByOther", "alreadyRedeemed", "unavailable"]

export default async function DashboardRedeemPage({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
  const user = await requireUser()
  const [{ result }, license] = await Promise.all([searchParams, currentAppSumoLicense(user.id)])
  const t = await getTranslations("appsumo")
  const tErrors = await getTranslations("appsumo.errors")
  const format = await getFormatter()
  const configured = Boolean(appSumoConfig())
  const outcome = result && RESULTS.includes(result) ? result : null
  const active = license?.status === "ACTIVE"
  const plan = license ? t(`plan.${tierForLicense(license.tier)}`) : null
  const statusLabel = license ? t(`status.${license.status}`) : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("dashTitle")}</h1>
        <p className="mt-1 text-muted-foreground">{t("dashLead", { site: siteConfig.name })}</p>
      </div>

      {outcome?.startsWith("redeemed") && (
        <div role="status" className="border border-l-4 border-primary/30 border-l-primary bg-primary/5 p-4 text-sm">
          <p className="font-medium">{t("redeemedNotice", { plan: plan ?? "" })}</p>
          {outcome === "redeemed-stopped" && <p className="mt-1 text-muted-foreground">{t("stoppedSubscription")}</p>}
        </div>
      )}
      {outcome && !outcome.startsWith("redeemed") && (
        <p role="alert" className="border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{tErrors(`codes.${outcome}`)}</p>
      )}

      {license && (
        <Card className="rounded-none">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-3">
              {t("lifetimePlan", { plan: plan ?? "" })}
              <Badge variant={active ? "success" : "secondary"} className="rounded-none">{statusLabel}</Badge>
            </CardTitle>
            <CardDescription>
              {license.redeemedAt ? t("redeemedOn", { date: format.dateTime(license.redeemedAt, { year: "numeric", month: "long", day: "numeric" }) }) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">{t("keyEnding", { suffix: license.licenseKey.slice(-6) })}</p>
            {active ? (
              <p>{t("activeBody", { plan: plan ?? "" })}</p>
            ) : license.status === "DEACTIVATED" ? (
              <p className="border border-border bg-muted/40 p-3">{t("deactivatedBody", { reason: license.deactivatedReason ?? t("noReason") })}</p>
            ) : null}
            <p className="text-muted-foreground">{t("changeTierHint")}</p>
          </CardContent>
        </Card>
      )}

      {(!active || !license) && (
        <Card className="rounded-none">
          <CardHeader>
            <CardTitle>{t("redeemTitle")}</CardTitle>
            <CardDescription>{t("redeemLead")}</CardDescription>
          </CardHeader>
          <CardContent>
            {configured ? <RedeemPanel signedIn /> : <p className="border border-border bg-muted/40 p-4 text-sm">{t("unavailable")}</p>}
          </CardContent>
        </Card>
      )}

      <p className="text-sm text-muted-foreground">
        <Link href="/dashboard/billing" className="font-medium text-primary underline-offset-4 hover:underline">{t("backToBilling")}</Link>
      </p>
    </div>
  )
}
