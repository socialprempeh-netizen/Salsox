import Link from "next/link"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { siteConfig } from "@/config/site"
import { appSumoConfig } from "@/lib/appsumo"
import { LogoMark } from "@/components/logo"
import { RedeemPanel } from "@/components/appsumo/redeem-panel"

/**
 * /redeem: where AppSumo sends a buyer after they activate a license (the
 * OAuth redirect URL registered with AppSumo, src/lib/appsumo.ts).
 *
 * Always answers 200 and never redirects, signed in or not: AppSumo checks
 * the address that way before it saves it. With AppSumo's `code` the key is
 * read automatically; without it (or without OAuth configured) the buyer
 * pastes the key. A signed-out buyer's key waits for sign-up or log-in.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("appsumo")
  return { title: `${t("publicTitle")} | ${siteConfig.name}` }
}

export default async function RedeemPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const [{ code }, user, t] = await Promise.all([searchParams, getCurrentUser(), getTranslations("appsumo")])
  const config = appSumoConfig()
  // A code is only worth exchanging when this site can exchange it.
  const usableCode = config?.oauth && typeof code === "string" && code.length <= 200 ? code : undefined

  return (
    <div className="border border-border bg-card/80 p-6 shadow-[var(--shadow-soft-lg)] backdrop-blur-xl sm:p-8">
      <div className="mb-6 flex items-start gap-4">
        <LogoMark className="h-11 w-11 shrink-0 ring-1 ring-primary/15" iconClassName="h-6 w-6" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{t("publicTitle")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("publicLead", { site: siteConfig.name })}</p>
        </div>
      </div>

      {config ? (
        <RedeemPanel code={usableCode} signedIn={Boolean(user)} />
      ) : (
        <p className="border border-border bg-muted/40 p-4 text-sm">{t("unavailable")}</p>
      )}

      <ol className="mt-6 space-y-2 border-t border-border pt-5 text-sm text-muted-foreground">
        <li className="flex gap-3"><span className="font-semibold text-foreground">1</span>{t("step1")}</li>
        <li className="flex gap-3"><span className="font-semibold text-foreground">2</span>{t("step2")}</li>
        <li className="flex gap-3"><span className="font-semibold text-foreground">3</span>{t("step3")}</li>
      </ol>

      {user && (
        <p className="mt-5 text-center text-xs text-muted-foreground">
          {t.rich("signedInAs", {
            email: user.email ?? "",
            link: (chunks) => <Link href="/dashboard/redeem" className="underline underline-offset-4 hover:text-foreground">{chunks}</Link>,
          })}
        </p>
      )}
    </div>
  )
}
