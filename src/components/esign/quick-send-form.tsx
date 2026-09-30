"use client"

/**
 * Quick Send: one screen, three inputs (PDF, emails, optional note), one
 * button. Signature and date fields are placed automatically for each signer.
 * On success the sender lands on the document page, where every signing link
 * can also be copied or shared over WhatsApp and SMS.
 */
import { useActionState, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Send } from "lucide-react"
import { quickSendAction, type ActionState } from "@/app/actions/documents"
import { parseEmailList } from "@/lib/esign/schemas"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/sonner"
import { PdfDropzone } from "./pdf-dropzone"

export function QuickSendForm() {
  const t = useTranslations("esign.quickSend")
  const router = useRouter()
  const [emails, setEmails] = useState("")
  const [state, action, pending] = useActionState<ActionState, FormData>(quickSendAction, {})
  const parsed = useMemo(() => parseEmailList(emails), [emails])

  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.ok && state.documentId) {
      // "Sent" only when the provider took every invitation. Otherwise the
      // document page opens without the success banner and shows who was not
      // reached, with a Resend button beside each of them.
      if (state.undelivered) {
        toast.error(t("sentUndelivered", { count: state.undelivered }))
        router.push(`/dashboard/documents/${state.documentId}`)
      } else {
        toast.success(t("sent"))
        router.push(`/dashboard/documents/${state.documentId}?sent=1`)
      }
    }
  }, [state, router, t])

  return (
    <form action={action} className="space-y-5">
      <PdfDropzone />
      <div className="space-y-2">
        <Label htmlFor="emails">{t("emailsLabel")}</Label>
        <Textarea
          id="emails"
          name="emails"
          required
          rows={3}
          inputMode="email"
          autoComplete="off"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          placeholder={t("emailsPlaceholder")}
          aria-describedby="emails-hint"
        />
        <p id="emails-hint" className="text-xs text-muted-foreground">
          {parsed.invalid.length > 0
            ? <span className="text-destructive">{t("invalidEmails", { list: parsed.invalid.join(", ") })}</span>
            : t("emailsHint", { count: parsed.emails.length })}
        </p>
      </div>
      <details className="rounded-xl border p-4 [&_summary]:cursor-pointer">
        <summary className="min-h-6 text-sm font-medium">{t("more")}</summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t("titleLabel")}</Label>
            <Input id="title" name="title" maxLength={140} placeholder={t("titlePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">{t("messageLabel")}</Label>
            <Textarea id="message" name="message" rows={3} maxLength={2000} placeholder={t("messagePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresInDays">{t("expiryLabel")}</Label>
            <select id="expiresInDays" name="expiresInDays" defaultValue="30" className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
              <option value="7">{t("expiryDays", { days: 7 })}</option>
              <option value="14">{t("expiryDays", { days: 14 })}</option>
              <option value="30">{t("expiryDays", { days: 30 })}</option>
              <option value="90">{t("expiryDays", { days: 90 })}</option>
              <option value="never">{t("expiryNever")}</option>
            </select>
          </div>
        </div>
      </details>
      <Button type="submit" size="lg" className="w-full" loading={pending} disabled={parsed.emails.length === 0 || parsed.invalid.length > 0}>
        <Send className="h-4 w-4" /> {t("submit", { count: parsed.emails.length })}
      </Button>
    </form>
  )
}
