"use client"

/**
 * Quick Send: one screen, three inputs (PDF, emails, optional note), one
 * button. Signature and date fields are placed automatically for each signer.
 * On success the sender lands on the document page, where every signing link
 * can also be copied or shared over WhatsApp and SMS.
 *
 * Opened with `?draft=1`, it picks up a request prepared on the public
 * request-a-signature tool (src/lib/request-draft.ts): the PDF, the signers
 * and a title, saved on this device before signup. The draft is used once
 * and is only filled in, never sent: the sender still presses Send.
 */
import { useActionState, useEffect, useMemo, useRef, useState } from "react"
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
import { useActionErrorToast } from "./plan-upsell"
import { DEFAULT_EXPIRY_DAYS } from "@/lib/esign/limits"
import { takeRequestDraft } from "@/lib/request-draft"

export function QuickSendForm() {
  const t = useTranslations("esign.quickSend")
  const router = useRouter()
  const showError = useActionErrorToast()
  const [emails, setEmails] = useState("")
  const [state, action, pending] = useActionState<ActionState, FormData>(quickSendAction, {})
  const parsed = useMemo(() => parseEmailList(emails), [emails])
  const [draftFile, setDraftFile] = useState<File | null>(null)
  const titleRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("draft") !== "1") return
    let live = true
    takeRequestDraft().then((draft) => {
      if (!live || !draft) return
      setDraftFile(new File([draft.bytes as BlobPart], draft.name, { type: "application/pdf" }))
      setEmails(draft.emails)
      if (titleRef.current) titleRef.current.value = draft.title.slice(0, 140)
      toast.success(t("draftLoaded"))
    })
    return () => {
      live = false
    }
  }, [t])

  useEffect(() => {
    if (state.error) showError(state.error, state.upgrade)
    if (state.ok && state.documentId) {
      // "Sent" only when the provider took every invitation. Otherwise the
      // document page opens without the success banner and shows who was not
      // reached, with a Resend button beside each of them.
      if (state.undelivered) {
        toast.error(t("sentUndelivered", { count: state.undelivered }))
        router.push(`/dashboard/documents/${state.documentId}`)
      } else if (state.notEmailed) {
        // No email provider: live, but nobody was emailed. A warning, not "Sent!".
        toast.warning(t("sentNotEmailed"))
        // ?sent=1 opens the page on its "email isn't configured" notice.
        router.push(`/dashboard/documents/${state.documentId}?sent=1`)
      } else {
        toast.success(t("sent"))
        router.push(`/dashboard/documents/${state.documentId}?sent=1`)
      }
    }
  }, [state, router, t, showError])

  return (
    <form action={action} className="space-y-5">
      <PdfDropzone initialFile={draftFile} />
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
            <Input ref={titleRef} id="title" name="title" maxLength={140} placeholder={t("titlePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="message">{t("messageLabel")}</Label>
            <Textarea id="message" name="message" rows={3} maxLength={2000} placeholder={t("messagePlaceholder")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expiresInDays">{t("expiryLabel")}</Label>
            <select id="expiresInDays" name="expiresInDays" defaultValue={String(DEFAULT_EXPIRY_DAYS)} className="h-11 w-full rounded-xl border bg-background px-3 text-sm">
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
