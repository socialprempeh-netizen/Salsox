/**
 * What the dashboard shows instead of a page while the organisation enforces
 * two-factor authentication and this person has none yet (mustEnrollNow in
 * src/lib/security-policy.ts, applied in the dashboard layout). The same two
 * methods as the Security page, with why they are being asked. Adding either
 * one lifts it: the layout reads again on the next render and shows the page.
 *
 * Signing out stays possible from the header, so nobody is trapped here.
 */
import { getTranslations } from "next-intl/server"
import { ShieldCheck } from "lucide-react"
import { SecurityMethods } from "@/components/settings/security-methods"

export async function EnforcedSetup({ userId, role }: { userId: string; role: string }) {
  const t = await getTranslations("dashboard.security")
  return (
    <div className="space-y-6">
      <div className="border border-t-4 border-t-primary bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("enforcedTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("enforcedBody")}</p>
          </div>
        </div>
      </div>
      <SecurityMethods userId={userId} role={role} />
    </div>
  )
}
