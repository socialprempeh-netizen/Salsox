/**
 * The admin area's second-factor check. 2FA is mandatory for admins, on the
 * account and on the session (src/lib/two-factor-policy.ts); the admin layout
 * sends an admin here when their session has not passed a code, usually after
 * a sign-in through a linked Google account. Anyone with nothing to verify is
 * sent where they belong: non-admins to the dashboard, admins without 2FA to
 * set it up, admins already verified to the admin area.
 */
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { getAdminAccess, requireUser } from "@/lib/auth"
import { ADMIN_ENROLL_PATH } from "@/lib/two-factor-policy"
import { getSecurityPolicy } from "@/lib/security-settings"
import { AdminVerifyForm } from "@/components/settings/admin-verify-form"

export async function generateMetadata() {
  const t = await getTranslations("dashboard.adminVerify")
  return { title: t("metaTitle") }
}

export default async function AdminVerifyPage() {
  await requireUser()
  const access = await getAdminAccess()
  if (access === "not-admin") redirect("/dashboard")
  if (access === "enroll") redirect(ADMIN_ENROLL_PATH)
  if (access === "ok") redirect("/admin")

  return (
    <div className="mx-auto max-w-md py-4 sm:py-10">
      {/* A passkey is offered while passkeys are on (/admin/security). */}
      <AdminVerifyForm passkey={(await getSecurityPolicy()).passkeyEnabled} />
    </div>
  )
}
