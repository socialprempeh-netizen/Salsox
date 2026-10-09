/**
 * Quick Send page: upload a PDF, type who signs, send. No editor.
 */
import { getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { Card, CardContent } from "@/components/ui/card"
import { QuickSendForm } from "@/components/esign/quick-send-form"
import { requestToolLeft, senderPlan } from "@/lib/esign/sender"
import { FREE_DOCUMENTS_PER_MONTH, FREE_REQUEST_TOOL_USES } from "@/lib/esign/plans"
import { FreeAllowanceNotice, RequestLimitReached } from "@/components/esign/plan-upsell"
import { prisma } from "@/lib/prisma"
import { emailConfirmationRequired } from "@/lib/esign/sending-limits"

export default async function QuickSendPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const user = await requireUser()
  const t = await getTranslations("esign.quickSend")
  // Free accounts see what is left of the month's documents before they send.
  const { documentsLeft } = await senderPlan(user.id)
  // The same rule the engine applies before sending (senderBlocker), asked
  // here so the form can say it before the click instead of after.
  const account = await prisma.user.findUnique({ where: { id: user.id }, select: { emailVerified: true } })
  const confirmationNeeded = emailConfirmationRequired() && !account?.emailVerified
  // Arriving from the public request-a-signature tool (`?draft=1`) with its
  // one free use spent: the upgrade takes the form's place, since the engine
  // would refuse the send (quickSend in documents.ts). Opened without the
  // draft, Quick Send works as usual within the monthly allowance. For a
  // while every send was gated like this, account-wide; now only the tool is.
  const fromTool = (await searchParams).draft === "1"
  const toolSpent = fromTool && (await requestToolLeft(user.id)) === 0
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      {toolSpent ? (
        <RequestLimitReached total={FREE_REQUEST_TOOL_USES} />
      ) : (
        <>
          <FreeAllowanceNotice left={documentsLeft} total={FREE_DOCUMENTS_PER_MONTH} />
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
