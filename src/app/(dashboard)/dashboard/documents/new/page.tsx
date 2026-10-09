/**
 * Start a document with full control: upload, then place recipients and
 * fields in the editor. Links to Quick Send for the fast path.
 */
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { UploadForm } from "@/components/esign/upload-form"
import { MAX_PDF_MB } from "@/lib/esign/limits"
import { senderPlan } from "@/lib/esign/sender"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import { FreeAllowanceNotice } from "@/components/esign/plan-upsell"

export default async function NewDocumentPage() {
  const user = await requireUser()
  const t = await getTranslations("esign.upload")
  // Free accounts see what is left of the month's documents before they start.
  const { documentsLeft } = await senderPlan(user.id)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}{" "}
          <Link href="/dashboard/documents/quick-send" className="text-primary underline underline-offset-4">
            {t("tryQuickSend")}
          </Link>
        </p>
      </div>
      <FreeAllowanceNotice left={documentsLeft} total={FREE_DOCUMENTS_PER_MONTH} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
          <CardDescription>{t("cardBody", { maxMb: MAX_PDF_MB })}</CardDescription>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>
    </div>
  )
}
