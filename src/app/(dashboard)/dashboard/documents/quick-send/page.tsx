/**
 * Quick Send page: upload a PDF, type who signs, send. No editor.
 */
import { getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { Card, CardContent } from "@/components/ui/card"
import { QuickSendForm } from "@/components/esign/quick-send-form"
import { senderPlan } from "@/lib/esign/sender"
import { FREE_SIGNATURE_REQUESTS } from "@/lib/esign/plans"
import { FreeAllowanceNotice, RequestLimitReached } from "@/components/esign/plan-upsell"
import { prisma } from "@/lib/prisma"
import { emailConfirmationRequired } from "@/lib/esign/sending-limits"

export default async function QuickSendPage() {
  const user = await requireUser()
  const t = await getTranslations("esign.quickSend")
  // Free accounts see whether their free signature request is still unused
  // before they send (was: what was left of the month's documents).
  const { documentsLeft } = await senderPlan(user.id)
  // The same rule the engine applies before sending (senderBlocker), asked
  // here so the form can say it before the click instead of after.
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } })
  const confirmationNeeded = emailConfirmationRequired() && !account?.emailVerified
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      {/* Once the free request is used, the upgrade takes the form's place:
          the engine would refuse the send anyway (documents.ts), and saying
          so after the file is chosen and the emails typed wastes the work. A
          request prepared on the public tool stays saved on the device, so
          it is still here after upgrading. */}
      {documentsLeft === 0 ? (
        <RequestLimitReached total={FREE_SIGNATURE_REQUESTS} />
      ) : (
        <>
          <FreeAllowanceNotice left={documentsLeft} total={FREE_SIGNATURE_REQUESTS} />
          <Card>
            <CardContent className="pt-6">
              <QuickSendForm confirmationNeeded={confirmationNeeded} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
