/**
 * Document detail: status, who has signed, per-recipient links (copy /
 * WhatsApp / SMS / email), one-click renew or recipient correction, the
 * Sign & Pay status, downloads, and the full audit trail.
 */
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getFormatter, getTranslations } from "next-intl/server"
import { CheckCircle2, Circle, Download, FileText, XCircle } from "lucide-react"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { canEditRecipient, isActionable, isRecipientExpired } from "@/lib/esign/rules"
import { signingUrl } from "@/lib/esign/share"
import { formatMinorUnits } from "@/lib/esign/payments/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DocumentStatusBadge } from "@/components/esign/document-status-badge"
import { DocumentActions } from "@/components/esign/document-actions"
import { RecipientActions } from "@/components/esign/recipient-actions"

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sent?: string }>
}) {
  const { id } = await params
  const { sent } = await searchParams
  const user = await requireUser()
  const t = await getTranslations("esign.detail")
  const format = await getFormatter()

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: {
      recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }], include: { payments: true } },
      auditEvents: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  })
  if (!document) notFound()
  if (document.status === "DRAFT") redirect(`/dashboard/documents/${id}/edit`)

  const now = new Date()
  const when = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" })
  const senderName = user.name || user.email || siteConfig.name
  const amountLabel =
    document.paymentAmount && document.paymentCurrency ? formatMinorUnits(document.paymentAmount, document.paymentCurrency) : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Link href="/dashboard/documents" className="text-sm text-muted-foreground hover:text-foreground">
          ← {t("back")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-bold">{document.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {document.sentAt ? t("sentOn", { date: when(document.sentAt) }) : null}
              {document.completedAt ? ` · ${t("completedOn", { date: when(document.completedAt) })}` : null}
            </p>
          </div>
          <DocumentStatusBadge status={document.status} />
        </div>
        {sent && (
          <p className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm">{t("sentBanner")}</p>
        )}
        {document.status === "EXPIRED" && (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t("expiredBanner")}</p>
        )}
        <DocumentActions documentId={document.id} status={document.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("recipients")}</CardTitle>
          <CardDescription>{t("recipientsHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {document.recipients.map((r) => {
            const expired = r.signingStatus === "NOT_SIGNED" && isRecipientExpired(r, now)
            const paid = r.payments.some((p) => p.status === "PAID")
            const live = document.status === "PENDING" || document.status === "EXPIRED"
            return (
              <div key={r.id} className="space-y-3 rounded-xl border p-3">
                <div className="flex items-start gap-3">
                  {r.signingStatus === "SIGNED" ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  ) : r.signingStatus === "REJECTED" ? (
                    <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{r.email}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="outline">{t(`role.${r.role}`)}</Badge>
                      {r.signingStatus === "SIGNED" && r.signedAt && <Badge variant="success">{t("signedAt", { date: when(r.signedAt) })}</Badge>}
                      {r.signingStatus === "REJECTED" && <Badge variant="destructive">{t("declined")}</Badge>}
                      {r.signingStatus === "NOT_SIGNED" && isActionable(r.role) && (
                        <Badge variant={expired ? "destructive" : "secondary"}>
                          {expired ? t("linkExpired") : r.viewedAt ? t("viewed") : r.sentAt ? t("sent") : t("waiting")}
                        </Badge>
                      )}
                      {r.mustPay && amountLabel && (
                        <Badge variant={paid ? "success" : "secondary"}>{paid ? t("paid", { amount: amountLabel }) : t("paymentDue", { amount: amountLabel })}</Badge>
                      )}
                    </div>
                    {r.rejectionReason && <p className="mt-2 text-sm italic text-muted-foreground">“{r.rejectionReason}”</p>}
                  </div>
                </div>
                {live && r.signingStatus === "NOT_SIGNED" && (
                  <RecipientActions
                    documentId={document.id}
                    documentTitle={document.title}
                    senderName={senderName}
                    recipient={{ id: r.id, name: r.name, email: r.email, phone: r.phone }}
                    url={isActionable(r.role) ? signingUrl(siteConfig.url, r.token) : null}
                    canEdit={canEditRecipient(document.status, r)}
                    canResend={document.status === "PENDING" && isActionable(r.role) && !expired}
                  />
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("files")}</CardTitle>
          <CardDescription>{t("filesHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:flex">
          <Button asChild variant="outline">
            <a href={`/api/documents/${document.id}/original`}><FileText className="h-4 w-4" /> {t("downloadOriginal")}</a>
          </Button>
          {document.sealedKey && (
            <Button asChild>
              <a href={`/api/documents/${document.id}/signed`}><Download className="h-4 w-4" /> {t("downloadSigned")}</a>
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("audit")}</CardTitle>
          <CardDescription>{t("auditHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 border-l pl-4">
            {document.auditEvents.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="font-medium">{t.has(`event.${e.type}`) ? t(`event.${e.type}`) : e.type}</p>
                <p className="break-words text-xs text-muted-foreground">
                  {when(e.createdAt)}
                  {e.actorEmail ? ` · ${e.actorEmail}` : ""}
                  {e.ipAddress ? ` · ${e.ipAddress}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  )
}
