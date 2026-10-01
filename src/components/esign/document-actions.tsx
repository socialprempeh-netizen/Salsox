"use client"

/**
 * Document-level buttons on the detail page. Renew is the headline fix: an
 * expired document comes back to life in one click, links and fields intact.
 */
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { Ban, BellRing, RefreshCw, Trash2 } from "lucide-react"
import {
  cancelDocumentAction,
  deleteDraftAction,
  remindDocumentAction,
  renewDocumentAction,
  type ActionState,
} from "@/app/actions/documents"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/sonner"

export function DocumentActions({ documentId, status }: { documentId: string; status: string }) {
  const t = useTranslations("esign.detail")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // `emails` marks the two actions that send email (renew, remind). For
  // those, success is only claimed when the provider took every message; a
  // refusal is shown as an error with a button to try again.
  function run(action: (id: string) => Promise<ActionState>, success: string, opts: { after?: () => void; emails?: boolean } = {}) {
    startTransition(async () => {
      const result = await action(documentId)
      const retry = opts.emails ? { action: { label: t("retry"), onClick: () => run(action, success, opts) } } : undefined
      if (result.error) return void toast.error(result.error, retry)
      if (result.undelivered) toast.error(t("undeliveredToast", { count: result.undelivered }), retry)
      // No email provider: the links were renewed, but nobody was emailed.
      else if (result.notEmailed) toast.warning(t("notEmailedToast"))
      else toast.success(success)
      if (opts.after) opts.after()
      else router.refresh()
    })
  }

  const renewable = status === "PENDING" || status === "EXPIRED"
  const cancellable = status === "PENDING" || status === "EXPIRED"

  return (
    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
      {renewable && (
        <Button
          variant={status === "EXPIRED" ? "primary" : "outline"}
          loading={pending}
          onClick={() => run(renewDocumentAction, t("renewed"), { emails: true })}
        >
          <RefreshCw className="h-4 w-4" /> {status === "EXPIRED" ? t("renewExpired") : t("renew")}
        </Button>
      )}
      {status === "PENDING" && (
        <Button variant="outline" loading={pending} onClick={() => run(remindDocumentAction, t("reminded"), { emails: true })}>
          <BellRing className="h-4 w-4" /> {t("remind")}
        </Button>
      )}
      {cancellable && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-destructive">
              <Ban className="h-4 w-4" /> {t("cancel")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("cancelBody")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(cancelDocumentAction, t("cancelled"))}>{t("cancelConfirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {status === "DRAFT" && (
        <Button
          variant="ghost"
          className="text-destructive"
          loading={pending}
          onClick={() => run(deleteDraftAction, t("deleted"), { after: () => router.push("/dashboard/documents") })}
        >
          <Trash2 className="h-4 w-4" /> {t("deleteDraft")}
        </Button>
      )}
    </div>
  )
}
