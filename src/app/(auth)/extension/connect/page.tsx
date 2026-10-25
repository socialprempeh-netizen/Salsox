import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { allowedExtensionIds, checkConnectRedirect, connectResult } from "@/lib/extension-connect"
import { mustEnrollBeforeUse } from "@/lib/security-enrollment"
import { LogoMark } from "@/components/logo"
import { ExtensionConsent } from "@/components/auth/extension-consent"

/**
 * /extension/connect: where the Salsox Signing Chrome extension signs in.
 *
 * Opened by the extension through chrome.identity.launchWebAuthFlow, in a
 * window that shares the browser's session, with `redirect_uri` set to the
 * extension's own chromiumapp.org address. The rules, and why the extension
 * id is checked, are in src/lib/extension-connect.ts.
 *
 * - An address that is not an allowed extension's: an explanation, and no
 *   redirect anywhere.
 * - Signed out: straight back to the extension with `error=signed_out`. The
 *   extension opens the ordinary sign-in page in a tab, where every way of
 *   signing in (password, Google, passkey, 2FA) works as usual, and the person
 *   presses Connect again.
 * - Held by the sign-in policy (2FA required and not set up): back with
 *   `error=setup_required`.
 * - Otherwise: who is connecting, what the extension will be able to do, and
 *   Connect or Cancel (ExtensionConsent).
 *
 * In the (auth) layout, so it is noindex and has the sign-in pages' card.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dashboard.extensionConnect")
  return { title: t("metaTitle", { site: siteConfig.name }) }
}

export default async function ExtensionConnectPage({ searchParams }: { searchParams: Promise<{ redirect_uri?: string }> }) {
  const { redirect_uri } = await searchParams
  const t = await getTranslations("dashboard.extensionConnect")
  const target = checkConnectRedirect(redirect_uri, allowedExtensionIds(process.env.SIGNING_EXTENSION_IDS), process.env.NODE_ENV === "development")

  if (target) {
    const user = await getCurrentUser()
    if (!user) redirect(connectResult(target, { error: "signed_out" }))
    if (await mustEnrollBeforeUse(user)) redirect(connectResult(target, { error: "setup_required" }))

    return (
      <div className="border border-border bg-card/80 p-8 shadow-[var(--shadow-soft-lg)] backdrop-blur-xl">
        <div className="mb-6 text-center">
          <div className="mb-4 flex justify-center">
            <LogoMark className="h-12 w-12 ring-1 ring-primary/15" iconClassName="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle", { email: user.email ?? "", site: siteConfig.name })}</p>
        </div>
        <ExtensionConsent redirectUri={target} />
      </div>
    )
  }

  return (
    <div className="border border-border bg-card/80 p-8 text-center shadow-[var(--shadow-soft-lg)] backdrop-blur-xl">
      <div className="mb-4 flex justify-center">
        <LogoMark className="h-12 w-12 ring-1 ring-primary/15" iconClassName="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-foreground">{t("invalidTitle")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("invalidBody", { site: siteConfig.name })}</p>
    </div>
  )
}
