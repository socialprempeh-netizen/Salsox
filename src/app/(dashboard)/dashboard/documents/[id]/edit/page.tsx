/**
 * Editor for a draft: loads the saved setup and the sender's ready payout
 * providers, then hands off to the client editor. Sent documents are not
 * editable here: they change through recipient correction and renewal, which
 * preserve what has already been signed.
 */
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { DocumentEditor } from "@/components/esign/document-editor"
import { DocumentActions } from "@/components/esign/document-actions"
import { senderPlan } from "@/lib/esign/sender"
import { hasFeature } from "@/lib/esign/plans"
import { smsConfigured } from "@/lib/esign/sms"

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser()
  const t = await getTranslations("esign.editor")

  const document = await prisma.document.findFirst({
    where: { id, userId: user.id },
    include: { recipients: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] }, fields: true },
  })
  if (!document) notFound()
  if (document.status !== "DRAFT") redirect(`/dashboard/documents/${id}`)

  const payouts = await prisma.payoutAccount.findMany({ where: { userId: user.id, ready: true }, select: { provider: true } })
  const payer = document.recipients.find((r) => r.mustPay)
  // Which Business controls to unlock; the save and send actions check again.
  const { tier } = await senderPlan(user.id)

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold">{document.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <DocumentActions documentId={document.id} status={document.status} />
      </div>
      <DocumentEditor
        documentId={document.id}
        fileUrl={`/api/documents/${document.id}/original?inline=1`}
        pageCount={document.pageCount}
        readyProviders={payouts.map((p) => p.provider)}
        smsAvailable={smsConfigured()}
        plan={{
          signAndPay: hasFeature(tier, "signAndPay"),
          sequentialSigning: hasFeature(tier, "sequentialSigning"),
          approvers: hasFeature(tier, "approvers"),
        }}
        initial={{
          title: document.title,
          signingOrder: document.signingOrder,
          subject: document.subject ?? "",
          message: document.message ?? "",
          expiresInDays: document.expiresInDays,
          // Saved recipients use their row id as the editor key.
          recipients: document.recipients.map((r) => ({ key: r.id, name: r.name, email: r.email, phone: r.phone ?? "", role: r.role, order: r.order })),
          fields: document.fields.map((f) => ({
            id: f.id,
            recipientKey: f.recipientId,
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
          })),
          payment:
            document.paymentAmount && document.paymentCurrency && payer
              ? { amount: (document.paymentAmount / 100).toFixed(2), currency: document.paymentCurrency, recipientKey: payer.id }
              : null,
          smsReminders: document.smsReminders,
        }}
      />
    </div>
  )
}
