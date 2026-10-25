/**
 * /dashboard/security: everything that protects how this person signs in, in
 * one place reachable from the sidebar. The authenticator app (TOTP) and
 * passkeys, side by side (SecurityMethods), and a link to the devices
 * signed in. Both used to sit inside Settings, where they were easy to miss.
 *
 * Lands here: the 2FA actions after setup, turning off or a backup code
 * (?ok= / ?error=, src/app/actions/two-factor.ts), an admin who must enroll
 * before using the admin area (?required=admin), and the payout suggestion.
 */
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ChevronRight, MonitorSmartphone, ShieldAlert } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { SecurityMethods } from "@/components/settings/security-methods"

// Result codes from the 2FA actions. The code decides the styling, the copy
// comes from the message file (same codes Settings used before the move).
const MESSAGE_IS_ERROR: Record<string, boolean> = {
  "2fa-enabled": false,
  "2fa-disabled": false,
  "2fa-password": true,
  "backup-used": false,
  demo: true,
}

export async function generateMetadata() {
  const t = await getTranslations("dashboard.security")
  return { title: t("title") }
}

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; required?: string }> }) {
  const user = await requireUser()
  const t = await getTranslations("dashboard.security")
  const tm = await getTranslations("dashboard.settings.messages")
  const { ok, error, required } = await searchParams
  const code = error ?? ok ?? ""
  const message = code in MESSAGE_IS_ERROR ? { text: tm(code), error: MESSAGE_IS_ERROR[code] } : null

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      {required === "admin" && (
        <div role="status" className="flex gap-3 border border-l-4 border-primary/30 border-l-primary bg-primary/5 p-4 text-sm">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p>{t("adminRequired")}</p>
        </div>
      )}

      {message && (
        <p className={`border px-4 py-2.5 text-sm ${message.error ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-primary/30 bg-primary/10 text-primary-hover"}`}>
          {message.text}
        </p>
      )}

      <SecurityMethods userId={user.id} role={user.role} />

      <Link href="/dashboard/settings/sessions" className="group flex items-center justify-between gap-3 border bg-card p-4 transition-colors hover:bg-muted/50 sm:p-5">
        <span className="flex min-w-0 items-center gap-3">
          <MonitorSmartphone className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">{t("sessionsTitle")}</span>
            <span className="block text-xs text-muted-foreground">{t("sessionsBody")}</span>
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </div>
  )
}
