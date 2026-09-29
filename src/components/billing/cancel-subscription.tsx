"use client"

/**
 * One-click cancel (and undo) on the billing page, no retention maze.
 * Cancelling keeps access until the end of the period already paid for.
 */
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { cancelSubscriptionAction, resumeSubscriptionAction } from "@/app/actions/billing"
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

export function CancelSubscription({ cancelling, endDate }: { cancelling: boolean; endDate: string }) {
  const t = useTranslations("esign.billing")
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(action: () => Promise<{ ok?: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action()
      if (result.error) return void toast.error(result.error)
      toast.success(success)
      router.refresh()
    })
  }

  if (cancelling) {
    return (
      <Button variant="outline" className="w-full sm:w-auto" loading={pending} onClick={() => run(resumeSubscriptionAction, t("resumed"))}>
        {t("resume")}
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="w-full text-destructive sm:w-auto">{t("cancel")}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("cancelTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("cancelBody", { date: endDate })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("keep")}</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(cancelSubscriptionAction, t("cancelled", { date: endDate }))}>
            {t("cancelConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
