/**
 * The two sign-in methods a person can add to their account, side by side:
 * the authenticator app (TOTP, TwoFactorCard) and passkeys (PasskeysCard).
 * Rendered by the Security page (/dashboard/security) and by the dashboard
 * layout in place of the page when the organisation enforces 2FA and this
 * person has none yet, so both places offer exactly the same thing.
 *
 * What each method offers follows the admin's policy (canEnroll in
 * src/lib/security-policy.ts); a method someone already has stays manageable
 * even when it can no longer be newly set up.
 */
import { getTranslations } from "next-intl/server"
import { Fingerprint, Smartphone } from "lucide-react"
import { prisma } from "@/lib/prisma"
import { canEnroll } from "@/lib/security-policy"
import { getSecurityPolicy } from "@/lib/security-settings"
import { isTwoFactorEnrolled } from "@/lib/two-factor-policy"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TwoFactorCard } from "@/components/settings/two-factor-card"
import { PasskeysCard } from "@/components/settings/passkeys-card"

export async function SecurityMethods({ userId, role }: { userId: string; role: string }) {
  const t = await getTranslations("dashboard.security")
  const [policy, user] = await Promise.all([
    getSecurityPolicy(),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        twoFactorEnabled: true,
        twoFactor: { select: { verified: true } },
        accounts: { where: { providerId: "credential" }, select: { id: true } },
        passkeys: { orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdAt: true, backedUp: true } },
      },
    }),
  ])
  if (!user) return null
  const isDemo = process.env.DEMO_MODE === "true"
  const totpOn = isTwoFactorEnrolled(user)

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card id="authenticator-app" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground" aria-hidden="true">
                <Smartphone className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <CardTitle>{t("totpTitle")}</CardTitle>
                <CardDescription className="mt-1">{t("totpDescription")}</CardDescription>
              </div>
            </div>
            {totpOn && <Badge variant="secondary">{t("on")}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {/* Was rendered on /dashboard/settings with only these three props;
              `available` follows the admin's policy now. */}
          <TwoFactorCard enabled={user.twoFactorEnabled} hasPassword={user.accounts.length > 0} isDemo={isDemo} available={canEnroll(policy, "totp", role)} />
        </CardContent>
      </Card>

      <Card id="passkeys" className="scroll-mt-20">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center bg-primary text-primary-foreground" aria-hidden="true">
                <Fingerprint className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div>
                <CardTitle>{t("passkeysTitle")}</CardTitle>
                <CardDescription className="mt-1">{t("passkeysDescription")}</CardDescription>
              </div>
            </div>
            {user.passkeys.length > 0 && <Badge variant="secondary">{t("passkeyCount", { count: user.passkeys.length })}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <PasskeysCard
            passkeys={user.passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt?.toISOString() ?? null, backedUp: p.backedUp }))}
            canAdd={canEnroll(policy, "passkey", role)}
            isDemo={isDemo}
          />
        </CardContent>
      </Card>
    </div>
  )
}
