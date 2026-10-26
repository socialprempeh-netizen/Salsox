import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { Metadata } from "next"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { mustEnrollBeforeUse } from "@/lib/security-enrollment"
import { authorizeRedirect, checkAuthorizeRequest, oauthClients } from "@/lib/oauth-server/rules"
import { LogoMark } from "@/components/logo"
import { OAuthConsent } from "@/components/auth/oauth-consent"

/**
 * /oauth/authorize: the OAuth server's consent page (src/lib/oauth-server).
 *
 * An integration (the Salesforce package's "browser flow") opens it with a
 * standard authorization request. The request is checked first
 * (checkAuthorizeRequest):
 * - an unknown client or an unregistered redirect address: an explanation
 *   here, and no redirect anywhere;
 * - any other fault: back to the client's own address with the error.
 * Then:
 * - signed out: through /api/oauth/resume to sign in, and back here after;
 * - held by the sign-in policy (2FA required and not set up): the dashboard,
 *   which shows the setup it requires;
 * - otherwise: which app, for which account, may do what, and Allow or
 *   Cancel (OAuthConsent). The server action checks everything again.
 *
 * In the (auth) layout, so it is noindex and has the sign-in pages' card.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("oauthConsent")
  return { title: t("metaTitle", { site: siteConfig.name }) }
}

export default async function OAuthAuthorizePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  // One value per parameter: a repeated one is ambiguous, and treated as missing.
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, typeof v === "string" ? v : undefined])) as Record<string, string | undefined>
  const t = await getTranslations("oauthConsent")
  const checked = checkAuthorizeRequest(params, oauthClients())

  if (!checked.ok && !("redirectUri" in checked)) {
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
  if (!checked.ok) redirect(authorizeRedirect(checked.redirectUri, { error: checked.error }, checked.state))

  const user = await getCurrentUser()
  if (!user) {
    const here = `/oauth/authorize?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"))}`
    redirect(`/api/oauth/resume?to=${encodeURIComponent(here)}`)
  }
  if (await mustEnrollBeforeUse(user)) redirect("/dashboard")

  return (
    <div className="border border-border bg-card/80 p-6 shadow-[var(--shadow-soft-lg)] backdrop-blur-xl sm:p-8">
      <div className="mb-6 text-center">
        <div className="mb-4 flex justify-center">
          <LogoMark className="h-12 w-12 ring-1 ring-primary/15" iconClassName="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title", { app: checked.request.client.name, site: siteConfig.name })}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("subtitle", { email: user.email ?? "" })}</p>
      </div>
      <OAuthConsent params={params} scopes={checked.request.scopes} appName={checked.request.client.name} />
    </div>
  )
}
