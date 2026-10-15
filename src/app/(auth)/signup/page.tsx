import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { registerUser, signUpWithGoogle } from "@/app/actions/auth"
import { isOAuthProviderConfigured } from "@/lib/oauth-providers"
import { LogoMark } from "@/components/logo"
import { PendingButton } from "@/components/auth/pending-button"
import { AuthNotice } from "@/components/auth/auth-notice"
import { Input } from "@/components/ui/input"
import { siteConfig } from "@/config/site"
import { safeNext } from "@/lib/safe-next"
import type { Metadata } from "next"

// Its own title in the tab and in any result that slips through; the
// (auth) layout marks every page here noindex.
export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations("authMeta")
  return { title: tMeta("signup", { site: siteConfig.name }) }
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const { error, next } = await searchParams
  // Where to land after signing up, when a public tool asked (the request a
  // signature tool hands its draft to Quick Send). Dashboard paths only.
  const after = safeNext(next)
  const t = await getTranslations("auth.signup")
  // An unknown code must not throw: the query string is user controlled, so a
  // key that does not exist falls back to the generic message.
  const errorMessage = error ? (t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")) : null

  // On the public demo the page stays visible as a showcase, but the form is
  // disabled: the demo has no email service attached and runs on shared
  // fixture accounts.
  const isDemo = process.env.DEMO_MODE === "true"
  // Marketing deployments delegate auth to the demo deployment.
  if (!isDemo && siteConfig.links.demo) redirect(siteConfig.links.demo)

  const hasEmailService = !!process.env.RESEND_API_KEY
  // Google first, when it is configured: no password to choose and no
  // confirmation email to wait for, so it is the quickest way to a first
  // document. Hidden without credentials (unlike sign-in, where the button
  // stays and reports the missing setup): a new visitor has the form below.
  const showGoogle = !isDemo && isOAuthProviderConfigured("google", process.env)

  return (
    <div className="flex flex-col gap-4">
      {/* Squared when `next` was added (was rounded-3xl, inputs and button
          rounded-full), per the design rules. */}
      <div className="border border-border bg-card/80 p-6 shadow-[var(--shadow-soft-lg)] backdrop-blur-xl sm:p-8">
        <div className="mb-8 text-center">
          <div className="mb-4 flex justify-center">
            <LogoMark className="h-12 w-12 ring-1 ring-primary/15" iconClassName="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasEmailService ? t("subtitleVerified") : t("subtitlePassword")}
          </p>
        </div>

        {isDemo && (
          <AuthNotice>
            {t("demoNotice")}{" "}
            {t.rich("demoNoticeExtra", {
              resend: (chunks) => (
                <a
                  href="https://resend.com"
                  className="underline underline-offset-2"
                  target="_blank"
                  rel="noreferrer"
                >
                  {chunks}
                </a>
              ),
            })}
          </AuthNotice>
        )}
        {!isDemo && !hasEmailService && (
          <AuthNotice>
            {t.rich("noEmailService", {
              code: (chunks) => <code>{chunks}</code>,
            })}
          </AuthNotice>
        )}

        {errorMessage && (
          <p className="mb-4 border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-center text-sm text-destructive">
            {errorMessage}
          </p>
        )}

        {showGoogle && (
          <>
            <form action={signUpWithGoogle}>
              {after !== "/dashboard" && <input type="hidden" name="next" value={after} />}
              <PendingButton className="flex h-12 w-full items-center justify-center gap-3 border border-border bg-background px-4 text-sm font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:bg-secondary hover:shadow-soft disabled:pointer-events-none disabled:opacity-45">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"/>
                  <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"/>
                  <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"/>
                  <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"/>
                </svg>
                {t("google")}
              </PendingButton>
            </form>
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs text-muted-foreground">{t("dividerEmail")}</span>
              </div>
            </div>
          </>
        )}

        <form action={registerUser} className="flex flex-col gap-3">
          {after !== "/dashboard" && <input type="hidden" name="next" value={after} />}
          <Input name="name" type="text" placeholder={t("namePlaceholder")} autoComplete="name" maxLength={100} disabled={isDemo} className="h-12 rounded-none px-4" />
          <Input name="email" type="email" placeholder={t("emailPlaceholder")} autoComplete="email" required disabled={isDemo} className="h-12 rounded-none px-4" />
          <Input
            name="password"
            type="password"
            placeholder={t("passwordPlaceholder")}
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            disabled={isDemo}
            className="h-12 rounded-none px-4"
          />
          <PendingButton
            disabled={isDemo}
            className="flex h-12 w-full items-center justify-center gap-2 bg-primary px-4 text-sm font-semibold text-primary-foreground transition-all hover:-translate-y-0.5 hover:shadow-soft disabled:pointer-events-none disabled:opacity-45"
          >
            {t("submit")}
          </PendingButton>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t.rich("haveAccount", {
            signin: (chunks) => (
              <Link href="/login" className="underline underline-offset-4 hover:text-foreground">
                {chunks}
              </Link>
            ),
          })}
        </p>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          {t.rich("legal", {
            terms: (chunks) => (
              <Link href="/terms" className="underline underline-offset-4 hover:text-foreground">{chunks}</Link>
            ),
            privacy: (chunks) => (
              <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">{chunks}</Link>
            ),
          })}
        </p>
      </div>
    </div>
  )
}
