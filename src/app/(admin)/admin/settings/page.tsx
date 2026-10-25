/**
 * /admin/settings: how this deployment is set up.
 *
 * The payment and messaging connections and the mode each runs in, the
 * deployment's general configuration (name, address, contact), and the
 * signing audit trail across all documents.
 *
 * Was "Settings & Security": the security half (admin rights and their 2FA,
 * admin sign-ins) moved to its own page, /admin/security, with the sign-in
 * policy switches, so neither is buried in the other.
 *
 * Read only. Secrets are never shown, only whether each is set and, for API
 * keys, whether it is a live or a test key. General configuration comes from
 * environment variables, which the page says.
 */
// The roles link is a TextLink now.
// import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { smsConfigured } from "@/lib/esign/sms"
import { providerConfig } from "@/lib/admin/health-data"
import { siteConfig } from "@/config/site"
import { Globe, History, KeyRound, Plug, UserCog, Wallet, Zap } from "lucide-react"
import { AdminPageHeader, Chip, Empty, Panel, ScrollTable, StatGrid, StatTile, TextLink } from "@/components/admin/admin-ui"

/** "live", "test" or null from an API key's prefix; the key itself never leaves this function. */
function keyMode(key: string | undefined): "live" | "test" | null {
  if (!key) return null
  return /_live_/.test(key) ? "live" : "test"
}

export default async function AdminSettingsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.settings")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })

  const [adminCount, payoutAccounts, auditEvents] = await Promise.all([
    prisma.user.count({ where: { role: "ADMIN" } }),
    prisma.payoutAccount.groupBy({ by: ["provider", "ready"], _count: { _all: true } }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, type: true, actorEmail: true, createdAt: true, document: { select: { title: true } } },
    }),
  ])

  const config = providerConfig()
  const payouts = (provider: "STRIPE" | "PAYSTACK", ready: boolean) => payoutAccounts.find((p) => p.provider === provider && p.ready === ready)?._count._all ?? 0

  const connections = [
    {
      key: "stripe",
      on: config.stripe,
      mode: keyMode(process.env.STRIPE_SECRET_KEY),
      detail: config.stripe ? t("stripeDetail", { webhook: config.stripeWebhook ? t("set") : t("missing"), ready: payouts("STRIPE", true), waiting: payouts("STRIPE", false) }) : undefined,
    },
    {
      key: "paystack",
      on: config.paystack,
      mode: keyMode(process.env.PAYSTACK_SECRET_KEY),
      detail: config.paystack ? t("paystackDetail", { ready: payouts("PAYSTACK", true), waiting: payouts("PAYSTACK", false) }) : undefined,
    },
    { key: "email", on: config.email, mode: null, detail: undefined },
    { key: "sms", on: smsConfigured(), mode: null, detail: undefined },
  ]
  const readyPayouts = payouts("STRIPE", true) + payouts("PAYSTACK", true)
  const general = [
    { key: "siteName", value: siteConfig.name },
    { key: "siteUrl", value: siteConfig.url },
    { key: "contactEmail", value: siteConfig.contactEmail },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} icon={KeyRound}>
        <TextLink href="/admin/security">{t("securityLink")}</TextLink>
      </AdminPageHeader>

      <StatGrid>
        <StatTile label={t("connectionsSetUp")} value={`${connections.filter((c) => c.on).length}/${connections.length}`} hint={t("connectionsSetUpHint")} icon={Plug} meter={connections.filter((c) => c.on).length / connections.length} />
        <StatTile label={t("liveKeys")} value={connections.filter((c) => c.mode === "live").length} hint={t("liveKeysHint")} tone="info" icon={Zap} />
        <StatTile label={t("payoutsReady")} value={readyPayouts} hint={t("payoutsReadyHint")} icon={Wallet} />
        <StatTile label={t("admins")} value={adminCount} href="/admin/users" icon={UserCog} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("connectionsTitle")} hint={t("connectionsHint")} flush index={2} icon={Plug}>
          <ul className="divide-y divide-border">
            {connections.map((c) => (
              <li key={c.key} className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{t(`connection.${c.key}`)}</p>
                  <p className="text-xs text-muted-foreground">{c.on ? (c.detail ?? t("connected")) : t("notConnected")}</p>
                </div>
                <Chip tone={!c.on ? "default" : c.mode === "test" ? "warn" : "good"}>
                  {!c.on ? tc("notConfigured") : c.mode === "live" ? tc("liveMode") : c.mode === "test" ? tc("testMode") : t("connected")}
                </Chip>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("generalTitle")} hint={t("generalHint")} flush index={3} icon={Globe}>
          <dl className="divide-y divide-border">
            {general.map((g) => (
              <div key={g.key} className="flex flex-col gap-0.5 p-4 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <dt className="text-xs text-muted-foreground">{t(`general.${g.key}`)}</dt>
                <dd className="min-w-0 break-all font-medium sm:text-right">{g.value || "—"}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      <Panel title={t("auditTitle")} hint={t("auditHint")} flush index={4} icon={History}>
        {auditEvents.length === 0 ? (
          <Empty icon={History}>{t("noAudit")}</Empty>
        ) : (
          <ScrollTable minWidth="36rem">
            <thead>
              <tr>
                <th>{t("when")}</th>
                <th>{t("event")}</th>
                <th>{t("document")}</th>
                <th>{t("actor")}</th>
              </tr>
            </thead>
            <tbody>
              {auditEvents.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{when(e.createdAt)}</td>
                  <td className="font-mono text-xs">{e.type}</td>
                  <td className="max-w-[16rem] truncate">{e.document.title}</td>
                  <td className="max-w-[14rem] truncate text-muted-foreground">{e.actorEmail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <p className="text-xs text-muted-foreground">{t("roleLogNote")}</p>
    </div>
  )
}
