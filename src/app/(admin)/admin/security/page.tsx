/**
 * /admin/security: how people sign in, split out of the old "Settings &
 * Security" page so neither half is buried in the other.
 *
 * - The policy switches (SecurityConsole): 2FA as a feature, its two methods
 *   (authenticator app, passkey), enforcing it on every user, and signing out
 *   after inactivity. Stored in SecuritySettings, rules in
 *   src/lib/security-policy.ts.
 * - The admin's own sign-in, with a direct link to set up the authenticator
 *   app or a passkey (/dashboard/security), so enrolling is one click from here.
 * - Who holds admin rights and which methods each uses, and recent admin
 *   sign-ins (both moved from /admin/settings).
 *
 * Reading never shows a secret: only whether a method is set up.
 */
import Link from "next/link"
import { redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { Fingerprint, KeyRound, LogIn, MonitorSmartphone, ShieldCheck, ShieldHalf, Smartphone, UserCog } from "lucide-react"
import { getCurrentUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getSecurityPolicy } from "@/lib/security-settings"
import { enrollmentShare, hasSecondFactor, isTwoFactorEnrolled } from "@/lib/two-factor-policy"
import { AdminPageHeader, Chip, Empty, Panel, ScrollTable, StatGrid, StatTile, TextLink } from "@/components/admin/admin-ui"
import { SecurityConsole } from "@/components/admin/security-console"
import { Button } from "@/components/ui/button"
import type { Prisma } from "@prisma/client"

/** A short browser and system label from a user agent, enough to recognise a device. */
function device(userAgent: string | null): string {
  if (!userAgent) return "—"
  const browser = /Edg\//.test(userAgent) ? "Edge" : /Chrome\//.test(userAgent) ? "Chrome" : /Firefox\//.test(userAgent) ? "Firefox" : /Safari\//.test(userAgent) ? "Safari" : "Browser"
  const system = /Windows/.test(userAgent) ? "Windows" : /Android/.test(userAgent) ? "Android" : /iPhone|iPad/.test(userAgent) ? "iOS" : /Mac OS/.test(userAgent) ? "macOS" : /Linux/.test(userAgent) ? "Linux" : ""
  return system ? `${browser}, ${system}` : browser
}

// The authenticator app counts once a correct code verified it, as in
// isTwoFactorEnrolled; a passkey counts as soon as it exists.
const withTotp: Prisma.UserWhereInput = { twoFactorEnabled: true, twoFactor: { some: { verified: true } } }
const withPasskey: Prisma.UserWhereInput = { passkeys: { some: {} } }
const notAdmin: Prisma.UserWhereInput = { role: { not: "ADMIN" } }

export async function generateMetadata() {
  const t = await getTranslations("admin.security")
  return { title: t("title") }
}

export default async function AdminSecurityPage() {
  const user = await getCurrentUser()
  if (!user || user.role !== "ADMIN") redirect("/dashboard")
  const t = await getTranslations("admin.security")
  const format = await getFormatter()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })
  const now = new Date()

  const [policy, admins, adminSessions, totpUsers, passkeyUsers, passkeysTotal, userTotal, usersEnrolled] = await Promise.all([
    getSecurityPolicy(),
    prisma.user.findMany({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        twoFactorEnabled: true,
        twoFactor: { select: { verified: true } },
        _count: { select: { passkeys: true } },
        sessions: { orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
      },
    }),
    prisma.session.findMany({
      where: { user: { role: "ADMIN" } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { id: true, createdAt: true, expiresAt: true, ipAddress: true, userAgent: true, user: { select: { email: true } } },
    }),
    prisma.user.count({ where: withTotp }),
    prisma.user.count({ where: withPasskey }),
    prisma.passkey.count(),
    prisma.user.count({ where: notAdmin }),
    prisma.user.count({ where: { AND: [notAdmin, { OR: [withTotp, withPasskey] }] } }),
  ])

  const methods = (a: (typeof admins)[number]) => ({ totp: isTwoFactorEnrolled(a), passkeys: a._count.passkeys })
  const withoutTwoFactor = admins.filter((a) => !hasSecondFactor(methods(a))).length
  const userShare = enrollmentShare(usersEnrolled, userTotal)
  const openSessions = adminSessions.filter((s) => s.expiresAt > now).length
  const me = admins.find((a) => a.id === user.id)
  const mine = me ? methods(me) : { totp: false, passkeys: 0 }

  return (
    <div className="space-y-6">
      <AdminPageHeader title={t("title")} subtitle={t("subtitle")} icon={ShieldCheck} />

      <StatGrid>
        <StatTile label={t("withoutTwoFactor")} value={withoutTwoFactor} tone={withoutTwoFactor > 0 ? "warn" : "good"} hint={t("withoutTwoFactorHint")} icon={ShieldHalf} meter={admins.length ? (admins.length - withoutTwoFactor) / admins.length : null} />
        <StatTile label={t("usersWithTwoFactor")} value={usersEnrolled} hint={t("usersWithTwoFactorHint", { total: userTotal, share: userShare ?? 0 })} tone="info" icon={ShieldCheck} meter={userShare === null ? null : userShare / 100} />
        <StatTile label={t("passkeys")} value={passkeysTotal} hint={t("passkeysHint", { count: passkeyUsers })} icon={Fingerprint} />
        <StatTile label={t("openSessions")} value={openSessions} hint={t("openSessionsHint")} icon={MonitorSmartphone} />
      </StatGrid>

      <SecurityConsole initial={policy} counts={{ totpUsers, passkeyUsers, usersWithout: userTotal - usersEnrolled }} />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* min-w-0: grid items default to min-width auto, and a long admin
            email would widen the column past a phone screen. */}
        <div id="your-sign-in" className="min-w-0 scroll-mt-24">
          <Panel title={t("yourSignIn")} hint={t("yourSignInHint")} icon={KeyRound} index={3}>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t("totpTitle")}</span>
                <Chip tone={mine.totp ? "good" : "default"}>{mine.totp ? t("on") : t("notSetUp")}</Chip>
              </li>
              <li className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2"><Fingerprint className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t("passkeyTitle")}</span>
                <Chip tone={mine.passkeys > 0 ? "good" : "default"}>{mine.passkeys > 0 ? t("passkeyCount", { count: mine.passkeys }) : t("notSetUp")}</Chip>
              </li>
            </ul>
            <Button asChild className="mt-5 h-11 w-full rounded-none sm:w-auto">
              <Link href="/dashboard/security">{t("manageMine")}</Link>
            </Button>
          </Panel>
        </div>

        <div id="admins" className="min-w-0 scroll-mt-24">
          <Panel title={t("adminsTitle")} hint={t("adminsHint")} flush icon={UserCog} index={4} action={<TextLink href="/admin/users">{t("manageRoles")}</TextLink>}>
            <ul className="divide-y divide-border">
              {admins.map((a) => {
                const m = methods(a)
                return (
                  <li key={a.id} className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.email}</p>
                      <p className="text-xs text-muted-foreground">{a.sessions[0] ? t("lastSignIn", { when: when(a.sessions[0].updatedAt) }) : t("neverSignedIn")}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {m.totp && <Chip tone="good">{t("totpShort")}</Chip>}
                      {m.passkeys > 0 && <Chip tone="good">{t("passkeyCount", { count: m.passkeys })}</Chip>}
                      {!hasSecondFactor(m) && <Chip tone="warn">{t("noSecondFactor")}</Chip>}
                    </div>
                  </li>
                )
              })}
            </ul>
          </Panel>
        </div>
      </div>

      <div id="sign-ins" className="scroll-mt-24">
        <Panel title={t("signInsTitle")} hint={t("signInsHint")} flush index={5} icon={LogIn}>
          {adminSessions.length === 0 ? (
            <Empty icon={LogIn}>{t("noSignIns")}</Empty>
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
      </div>
    </div>
  )
}
