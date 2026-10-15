/**
 * /admin/settings: the Settings & Security section.
 *
 * Who holds admin rights and how well those accounts are protected
 * (two-factor, last sign-in, open sessions); the payment and messaging
 * connections and the mode each runs in; and the audit logs that exist: admin
 * sign-ins (from sessions) and the signing audit trail across all documents.
 *
 * Read only. Secrets are never shown, only whether each is set and, for API
 * keys, whether it is a live or a test key. Granting admin rights is done
 * from Users; role changes are not written to a log yet, which the page says.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { smsConfigured } from "@/lib/esign/sms"
import { providerConfig } from "@/lib/admin/health-data"
import { AdminPageHeader, Chip, Empty, Panel, ScrollTable, StatGrid, StatTile } from "@/components/admin/admin-ui"

/** "live", "test" or null from an API key's prefix; the key itself never leaves this function. */
function keyMode(key: string | undefined): "live" | "test" | null {
  if (!key) return null
  return /_live_/.test(key) ? "live" : "test"
}

/** A short browser and system label from a user agent, enough to recognise a device. */
function device(userAgent: string | null): string {
  if (!userAgent) return "—"
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser"
  const system = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : ""
  return system ? `${browser}, ${system}` : browser
}

export default async function AdminSettingsPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("adminConsole.settings")
  const tc = await getTranslations("adminConsole.common")
  const format = await getFormatter()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })
  const now = new Date()

  const [admins, adminSessions, payoutAccounts, auditEvents] = await Promise.all([
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, twoFactorEnabled: true, sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } } },
    }),
    prisma.session.findMany({
      where: { user: { role: "ADMIN" } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, createdAt: true, expiresAt: true, ipAddress: true, userAgent: true, user: { select: { email: true } } },
    }),
    prisma.payoutAccount.groupBy({ by: ["provider", "ready"], _count: { _all: true } }),
    prisma.auditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, type: true, actorEmail: true, createdAt: true, document: { select: { title: true } } },
    }),
  ])

  const config = providerConfig()
  const withoutTwoFactor = admins.filter((a) => !a.twoFactorEnabled).length
  const openSessions = adminSessions.filter((s) => s.expiresAt > now).length
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

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} />

      <StatGrid>
        <StatTile label={t("admins")} value={admins.length} href="/admin/users" />
        <StatTile label={t("withoutTwoFactor")} value={withoutTwoFactor} tone={withoutTwoFactor > 0 ? "warn" : "good"} hint={t("twoFactorHint")} />
        <StatTile label={t("openSessions")} value={openSessions} hint={t("openSessionsHint")} />
        <StatTile label={t("liveKeys")} value={connections.filter((c) => c.mode === "live").length} hint={t("liveKeysHint")} />
      </StatGrid>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("permissionsTitle")} hint={t("permissionsHint")} flush action={<Link href="/admin/users" className="text-sm font-medium text-primary underline-offset-4 hover:underline">{t("manageRoles")}</Link>}>
          <ul className="divide-y divide-border">
            {admins.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 p-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{a.email}</p>
                  <p className="text-xs text-muted-foreground">{a.sessions[0] ? t("lastSignIn", { when: when(a.sessions[0].updatedAt) }) : t("neverSignedIn")}</p>
                </div>
                <Chip tone={a.twoFactorEnabled ? "good" : "warn"}>{a.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}</Chip>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={t("connectionsTitle")} hint={t("connectionsHint")} flush index={3}>
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
      </div>

      <Panel title={t("signInsTitle")} hint={t("signInsHint")} flush index={4}>
        {adminSessions.length === 0 ? (
          <Empty>{t("noSignIns")}</Empty>
        ) : (
          <ScrollTable minWidth="36rem">
            <thead>
              <tr>
                <th>{t("when")}</th>
                <th>{t("admin")}</th>
                <th>{t("device")}</th>
                <th>{t("ip")}</th>
                <th>{t("state")}</th>
              </tr>
            </thead>
            <tbody>
              {adminSessions.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-muted-foreground">{when(s.createdAt)}</td>
                  <td className="max-w-[14rem] truncate">{s.user.email}</td>
                  <td>{device(s.userAgent)}</td>
                  <td className="font-mono text-xs">{s.ipAddress ?? "—"}</td>
                  <td>
                    <Chip tone={s.expiresAt > now ? "good" : "default"}>{s.expiresAt > now ? t("open") : t("expired")}</Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </Panel>

      <Panel title={t("auditTitle")} hint={t("auditHint")} flush index={5}>
        {auditEvents.length === 0 ? (
          <Empty>{t("noAudit")}</Empty>
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
