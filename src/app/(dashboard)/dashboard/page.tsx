import { requireUser } from "@/lib/auth"
import { getFormatter, getTranslations } from "next-intl/server"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { getEntitlement } from "@/lib/billing"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GetStartedChecklist } from "@/components/dashboard/get-started-checklist"
import { CheckoutStatusToast } from "@/components/billing/checkout-status-toast"
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge"
import { isKitSite } from "@/config/kit"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"

export default async function DashboardPage() {
  const t = await getTranslations("dashboard.home")
  const format = await getFormatter()
  const user = await requireUser()

  const entitlement = await getEntitlement(user.id)
  const subscription = entitlement.kind === "subscription" ? entitlement.subscription : null
  const lifetime = entitlement.kind === "lifetime" ? entitlement.purchase : null

  // One grouped count instead of one query per status.
  const [statusCounts, userRow] = await Promise.all([
    prisma.document.groupBy({ by: ["status"], where: { userId: user.id }, _count: { _all: true } }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, onboardingDismissedAt: true, stripeCustomerId: true },
    }),
  ])

  const countOf = (status: string) => statusCounts.find((c) => c.status === status)?._count._all ?? 0
  const documentCount = statusCounts.reduce((sum, c) => sum + c._count._all, 0)
  const awaiting = countOf("PENDING")
  const completed = countOf("COMPLETED")
  const expired = countOf("EXPIRED")

  // Formatted through next-intl rather than a hardcoded "en-US": a date is
  // part of the interface, and a locale that reads dates day-first would show
  // the wrong one otherwise.
  const renewalDate = subscription?.currentPeriodEnd
    ? format.dateTime(new Date(subscription.currentPeriodEnd), {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
    : null

  return (
    <div className="space-y-6">
      <CheckoutStatusToast />
      <div>
        <h1 className="text-2xl font-bold">
          {t("greeting", { name: user.name?.split(" ")[0] ?? t("greetingFallback") })}
        </h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!userRow?.onboardingDismissedAt && (
        <GetStartedChecklist
          hasName={Boolean(userRow?.name)}
          hasDocument={documentCount > 0}
          hasBilling={entitlement.kind !== "free" || Boolean(userRow?.stripeCustomerId)}
        />
      )}

      {/* Documents at a glance, with the two ways to send one. Quick Send is
          first because it is the fastest path: upload, type an email, done. */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{t("documentsTitle")}</CardTitle>
              <CardDescription>{t("documentsCount", { count: documentCount })}</CardDescription>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild size="sm">
                <Link href="/dashboard/documents/quick-send">{t("quickSend")}</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/documents/new">{t("newDocument")}</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        {documentCount > 0 && (
          <CardContent className="grid grid-cols-3 gap-3 pt-0">
            <Link href="/dashboard/documents?status=PENDING" className="rounded-xl border p-3 hover:border-primary/40">
              <p className="text-2xl font-bold">{awaiting}</p>
              <p className="text-xs text-muted-foreground">{t("awaiting")}</p>
            </Link>
            <Link href="/dashboard/documents?status=COMPLETED" className="rounded-xl border p-3 hover:border-primary/40">
              <p className="text-2xl font-bold">{completed}</p>
              <p className="text-xs text-muted-foreground">{t("completed")}</p>
            </Link>
            <Link href="/dashboard/documents?status=EXPIRED" className="rounded-xl border p-3 hover:border-primary/40">
              <p className="text-2xl font-bold">{expired}</p>
              <p className="text-xs text-muted-foreground">{t("expired")}</p>
            </Link>
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("currentPlan")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {lifetime?.plan.name ?? subscription?.plan.name ?? t("planFree")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("status")}</CardDescription>
          </CardHeader>
          <CardContent>
            {subscription ? (
              <SubscriptionStatusBadge status={subscription.status} />
            ) : (
              <Badge variant={lifetime ? "success" : "secondary"}>
                {lifetime ? t("statusLifetime") : t("statusFree")}
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{t("nextBilling")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{lifetime ? t("none") : renewalDate ?? t("none")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Upsell for users without a plan. On the kit's own site it teases the
          Pro tier; in your app it points at your paid plans. Delete it if you
          would rather not sell from inside the dashboard. */}
      {entitlement.kind === "free" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-base">
              {t("upsellTitle")}
            </CardTitle>
            <CardDescription>
              {t("upsellBody", { free: FREE_DOCUMENTS_PER_MONTH })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link href={isKitSite ? "/pricing" : "/dashboard/billing"}>
                {t("upsellCta")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
