"use client"

/**
 * Step one of the full flow: upload a PDF, then continue to the editor where
 * recipients and fields are placed. (For the one-screen path, see
 * quick-send-form.tsx.)
 */
import { useActionState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { uploadDocumentAction, type ActionState } from "@/app/actions/documents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/sonner"
import { PdfDropzone } from "./pdf-dropzone"

export function UploadForm() {
  const t = useTranslations("esign.upload")
  const router = useRouter()
  const [state, action, pending] = useActionState<ActionState, FormData>(uploadDocumentAction, {})

  useEffect(() => {
    if (state.error) toast.error(state.error)
    if (state.ok && state.documentId) router.push(`/dashboard/documents/${state.documentId}/edit`)
  }, [state, router])

  return (
    <form action={action} className="space-y-5">
      <PdfDropzone />
      <div className="space-y-2">
        <Label htmlFor="title">{t("titleLabel")}</Label>
        <Input id="title" name="title" maxLength={140} placeholder={t("titlePlaceholder")} />
      </div>
      <Button type="submit" size="lg" className="w-full sm:w-auto" loading={pending}>
        {t("continue")}
      </Button>
    </form>
  )
}
