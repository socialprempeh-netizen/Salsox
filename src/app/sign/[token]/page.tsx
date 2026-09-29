/**
 * Public signing page: /sign/{token}.
 *
 * No account, no app: the token is the credential. The page resolves what the
 * signer may do right now (rules.ts) and shows either the signing wizard or a
 * clear status screen: already signed, waiting for someone else first,
 * expired (with who to ask for a renewal), declined or cancelled.
 *
 * Returning from a Sign & Pay checkout lands here with `?payment={id}`; the
 * payment is verified with the provider directly before anything else.
 */
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { CheckCircle2, Clock, Download, Hourglass, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { siteConfig } from "@/config/site"
import { confirmPayment, getSigningContext, markViewed } from "@/lib/esign/signing"
import { formatMinorUnits } from "@/lib/esign/payments/select"
import { SigningWizard, type WizardField } from "@/components/esign/signing-wizard"

export const metadata: Metadata = {
  // Signing links are private; keep them out of search engines and previews.
  robots: { index: false, follow: false },
}

export default async function SignPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ payment?: string }>
}) {
  const { token } = await params
  const { payment } = await searchParams
  const t = await getTranslations("esign.sign")

  let context = await getSigningContext(token)
  if (!context) notFound()

  if (payment && context.recipient.payments.some((p) => p.id === payment)) {
    try {
      await confirmPayment(payment)
    } catch (error) {
      console.error("[esign] payment confirmation on return failed", error)
    }
    context = (await getSigningContext(token))!
  }

  const { recipient, document, blocker } = context
  if (!blocker || blocker === "NOT_YOUR_TURN") await markViewed(token)
  const sender = document.user.name || document.user.email

  if (blocker) {
    const status = {
      ALREADY_SIGNED: { icon: CheckCircle2, tone: "text-primary", title: t("signedTitle"), body: document.status === "COMPLETED" ? t("signedCompleteBody") : t("signedWaitingBody") },
      NOT_YOUR_TURN: { icon: Hourglass, tone: "text-amber-600", title: t("notYourTurnTitle"), body: t("notYourTurnBody") },
      EXPIRED: { icon: Clock, tone: "text-amber-600", title: t("expiredTitle"), body: t("expiredBody", { sender, email: document.user.email }) },
      REJECTED: { icon: XCircle, tone: "text-destructive", title: t("rejectedTitle"), body: t("rejectedBody", { sender }) },
      DOCUMENT_NOT_PENDING: {
        icon: document.status === "COMPLETED" ? CheckCircle2 : XCircle,
        tone: document.status === "COMPLETED" ? "text-primary" : "text-muted-foreground",
        title: document.status === "COMPLETED" ? t("completeTitle") : t("closedTitle"),
        body: document.status === "COMPLETED" ? t("signedCompleteBody") : t("closedBody", { sender }),
      },
      NO_ACTION_REQUIRED: { icon: CheckCircle2, tone: "text-primary", title: t("ccTitle"), body: t("ccBody", { sender }) },
    }[blocker]
    const Icon = status.icon
    const canDownload = document.status === "COMPLETED" && Boolean(document.sealedKey)
    return (
      <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <Icon className={`h-12 w-12 ${status.tone}`} />
        <h1 className="text-2xl font-bold">{status.title}</h1>
        <p className="text-sm text-muted-foreground">{document.title}</p>
        <p className="text-muted-foreground">{status.body}</p>
        {canDownload && (
          <Button asChild size="lg" className="w-full">
            <a href={`/sign/${token}/download`}>
              <Download className="h-4 w-4" /> {t("downloadSigned")}
            </a>
          </Button>
        )}
        {(blocker === "NO_ACTION_REQUIRED" || blocker === "NOT_YOUR_TURN") && (
          <Button asChild size="lg" variant="outline" className="w-full">
            <a href={`/sign/${token}/file`} target="_blank" rel="noopener">{t("viewDocument")}</a>
          </Button>
        )}
        <p className="pt-6 text-xs text-muted-foreground">{t("poweredBy", { site: siteConfig.name })}</p>
      </main>
    )
  }

  const fields: WizardField[] = context.fields.map((f) => ({
    id: f.id,
    type: f.type,
    page: f.page,
    x: f.x,
    y: f.y,
    width: f.width,
    height: f.height,
    required: f.required,
    label: f.label,
    value: f.value,
    inserted: f.inserted,
    preview: f.signature?.imageDataUrl ?? f.signature?.typedText ?? null,
  }))

  return (
    <SigningWizard
      token={token}
      title={document.title}
      senderName={sender}
      recipientName={recipient.name}
      recipientEmail={recipient.email}
      fileUrl={`/sign/${token}/file`}
      extraPages={context.renderedPageCount - document.pageCount}
      fields={fields}
      payment={{
        due: context.paymentDue,
        amountLabel:
          document.paymentAmount && document.paymentCurrency
            ? formatMinorUnits(document.paymentAmount, document.paymentCurrency)
            : null,
      }}
      alreadyViewedIntro={fields.some((f) => f.inserted)}
    />
  )
}
