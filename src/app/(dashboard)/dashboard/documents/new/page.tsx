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
import { FREE_SIGNATURE_REQUESTS } from "@/lib/esign/plans"
import { FreeAllowanceNotice, RequestLimitReached } from "@/components/esign/plan-upsell"

export default async function NewDocumentPage() {
  const user = await requireUser()
  const t = await getTranslations("esign.upload")
  // Free accounts see whether their free signature request is still unused
  // before they start (was: what was left of the month's documents).
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
      {/* Same as Quick Send: once the free request is used, the upgrade
          replaces the upload, since the document could not be sent. */}
      {documentsLeft === 0 ? (
        <RequestLimitReached total={FREE_SIGNATURE_REQUESTS} />
      ) : (
        <>
          <FreeAllowanceNotice left={documentsLeft} total={FREE_SIGNATURE_REQUESTS} />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("cardTitle")}</CardTitle>
              <CardDescription>{t("cardBody", { maxMb: MAX_PDF_MB })}</CardDescription>
            </CardHeader>
            <CardContent>
              <UploadForm />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
