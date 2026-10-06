import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { QrCode, ShieldCheck, FileLock2 } from "lucide-react"
import { siteConfig } from "@/config/site"
import { pageMetadata } from "@/lib/metadata"
import { verifyDocumentAction, type VerifyState } from "@/app/actions/verify"
import { VerifyForm } from "@/components/verify/verify-form"

/**
 * The public "verify a document" page.
 *
 * Anyone holding a signed PDF can check that it is a genuine, completed record
 * from this deployment: who signed, in what role, and when. Nothing of the
 * document's content is shown (src/lib/esign/verify.ts says what is and is
 * not). The certificate page of every sealed copy prints a QR code pointing
 * here with `?code=`, and that lookup runs on the server so the answer is in
 * the first paint, not after a round trip from a phone.
 */

type Props = { searchParams: Promise<{ code?: string | string[] }> }

const firstParam = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? ""

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const t = await getTranslations("verify")
  const code = firstParam((await searchParams).code)
  return {
    ...pageMetadata({ title: `${t("metaTitle")} | ${siteConfig.name}`, description: t("metaDescription"), path: "/verify" }),
    // The page is worth finding; a result for one document's code is not.
    ...(code ? { robots: { index: false, follow: false } } : {}),
  }
}

export default async function VerifyPage({ searchParams }: Props) {
  const t = await getTranslations("verify")
  const code = firstParam((await searchParams).code).slice(0, 64)
  const initialState: VerifyState = code ? await verifyDocumentAction(code) : { status: "idle" }

  const steps = [
    { icon: QrCode, title: t("how1Title"), body: t("how1Body") },
    { icon: FileLock2, title: t("how2Title"), body: t("how2Body") },
    { icon: ShieldCheck, title: t("how3Title"), body: t("how3Body") },
  ]

  return (
    <section className="relative py-16 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-glow" />
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-12">
        <p className="inline-flex items-center gap-2 border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden="true" /> {t("eyebrow")}
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t("title")}</h1>
        <p className="mt-3 text-muted-foreground">{t("intro", { app: siteConfig.name })}</p>

        <div className="mt-8">
          <VerifyForm initialQuery={code} initialState={initialState} />
        </div>

        <div className="mt-12 grid gap-px border border-border bg-border sm:grid-cols-3">
          {steps.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-background p-4">
              <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <p className="mt-2 text-sm font-semibold">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">{t("privacyNote")}</p>
      </div>
    </section>
  )
}
