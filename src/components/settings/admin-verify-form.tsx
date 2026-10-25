"use client"

/**
 * The admin area's second-factor check (/dashboard/admin-verify): one code
 * from the authenticator, or one backup code. It exists for an admin whose
 * session never passed the code, typically a sign-in through a linked Google
 * account; the rule is in src/lib/two-factor-policy.ts and the check runs in
 * verifyAdminSession (src/app/actions/two-factor.ts).
 *
 * Same two modes as the sign-in step at /2fa, switched in place. Errors come
 * back in the action state, so the code field keeps focus where it was.
 * The card enters with framer-motion and the mode switch cross-fades; with
 * reduced motion both just appear. Square corners, phone-first.
 */
import { useActionState, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { ShieldCheck } from "lucide-react"
import { verifyAdminSession, type AdminVerifyState } from "@/app/actions/two-factor"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function AdminVerifyForm() {
  const t = useTranslations("dashboard.adminVerify")
  const reduceMotion = useReducedMotion()
  const [backup, setBackup] = useState(false)
  const [state, action, pending] = useActionState<AdminVerifyState, FormData>(verifyAdminSession, {})

  return (
    <motion.div
      initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="border border-t-4 border-t-primary bg-card p-5 sm:p-8"
    >
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("why")}</p>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-5 border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      )}

      <form action={action} className="mt-5 space-y-3">
        <input type="hidden" name="mode" value={backup ? "backup" : "app"} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={backup ? "backup" : "app"}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            className="space-y-1.5"
          >
            <Label htmlFor="admin-verify-code">{backup ? t("backupLabel") : t("codeLabel")}</Label>
            <p className="text-xs text-muted-foreground">{backup ? t("backupSubtitle") : t("subtitle")}</p>
            <Input
              id="admin-verify-code"
              name="code"
              autoComplete="one-time-code"
              inputMode={backup ? "text" : "numeric"}
              autoFocus
              required
              placeholder={backup ? "ABCDE-FGHJK" : "123456"}
              className={`h-12 px-4 ${backup ? "" : "text-center font-mono text-lg tracking-[0.4em]"}`}
            />
          </motion.div>
        </AnimatePresence>
        <Button type="submit" disabled={pending} className="h-12 w-full rounded-none">
          {t("submit")}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setBackup((b) => !b)}
        className="mt-4 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {backup ? t("useApp") : t("useBackup")}
      </button>
    </motion.div>
  )
}
