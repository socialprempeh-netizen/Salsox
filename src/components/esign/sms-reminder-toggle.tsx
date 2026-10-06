"use client"

/**
 * The SMS reminder switch on the page of a document that is out for
 * signature. Drafts set the same option in the editor; this is for turning it
 * on (or off) after sending, when a signer has gone quiet.
 *
 * The page renders it only when the deployment has an SMS provider, so there
 * is no disabled state to explain. The server re-checks that and ownership on
 * every change (setSmsReminders in src/lib/esign/documents.ts). The switch
 * updates at once and rolls back if the server refuses. The line under it
 * fades in with framer-motion, without movement under reduced motion.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { MessageSquareText } from "lucide-react"
import { setSmsRemindersAction } from "@/app/actions/documents"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

export function SmsReminderToggle({ documentId, enabled, reachable }: { documentId: string; enabled: boolean; reachable: number }) {
  const t = useTranslations("esign.detail")
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [on, setOn] = useState(enabled)
  const [pending, startTransition] = useTransition()

  function change(next: boolean) {
    setOn(next)
    startTransition(async () => {
      const result = await setSmsRemindersAction(documentId, next)
      if (result.error) {
        setOn(!next)
        toast.error(result.error)
        return
      }
      toast.success(next ? t("smsOnToast") : t("smsOffToast"))
      router.refresh()
    })
  }

  return (
    <div className="space-y-2 border p-4">
      <label className={cn("flex min-h-11 items-center gap-3 text-sm font-medium", pending && "opacity-70")}>
        <input type="checkbox" className="h-5 w-5" checked={on} disabled={pending} onChange={(e) => change(e.target.checked)} />
        <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t("smsToggle")}
      </label>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={on ? "on" : "off"}
          initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={cn("text-sm", on && reachable === 0 ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
        >
          {!on ? t("smsOffHint") : reachable === 0 ? t("smsNoPhones") : t("smsOnHint", { count: reachable })}
        </motion.p>
      </AnimatePresence>
    </div>
  )
}
