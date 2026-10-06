/**
 * Quick Send page: upload a PDF, type who signs, send. No editor.
 */
import { getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { Card, CardContent } from "@/components/ui/card"
import { QuickSendForm } from "@/components/esign/quick-send-form"
import { senderPlan } from "@/lib/esign/sender"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import { FreeAllowanceNotice } from "@/components/esign/plan-upsell"
import { prisma } from "@/lib/prisma"
import { emailConfirmationRequired } from "@/lib/esign/sending-limits"

export default async function QuickSendPage() {
  const user = await requireUser()
  const t = await getTranslations("esign.quickSend")
  // Free accounts see what is left of the month's documents before they send.
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
      <FreeAllowanceNotice left={documentsLeft} total={FREE_DOCUMENTS_PER_MONTH} />
      <Card>
        <CardContent className="pt-6">
          <QuickSendForm confirmationNeeded={confirmationNeeded} />
        </CardContent>
      </Card>
    </div>
  )
}
