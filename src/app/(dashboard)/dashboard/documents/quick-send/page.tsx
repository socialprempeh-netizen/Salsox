/**
 * Quick Send page: upload a PDF, type who signs, send. No editor.
 */
import { getTranslations } from "next-intl/server"
import { requireUser } from "@/lib/auth"
import { Card, CardContent } from "@/components/ui/card"
import { QuickSendForm } from "@/components/esign/quick-send-form"

export default async function QuickSendPage() {
  await requireUser()
  const t = await getTranslations("esign.quickSend")
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <QuickSendForm />
        </CardContent>
      </Card>
    </div>
  )
}
