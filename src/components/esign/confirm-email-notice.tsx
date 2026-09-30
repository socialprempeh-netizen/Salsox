"use client"

/**
 * The notice shown across the Documents pages while the sender's own email is
 * still unconfirmed: it says why sending is locked, which address the link
 * went to, and offers to send it again.
 *
 * It only explains and asks; the rule itself is enforced on the server
 * (`senderBlocker` in src/lib/esign/sender.ts), so hiding or bypassing this
 * component unlocks nothing.
 *
 * "Sent" is shown only when the email provider accepted the message (the
 * action reports that). A refusal is a distinct, visible failure: the status
 * line turns into an error and the button becomes "Try again".
 *
 * Layout is phone-first: text and button stack, and sit side by side from
 * `sm` up. Square corners throughout, per the project's design rules. The
 * entrance and the status line are animated with framer-motion and fall back
 * to a plain fade when the visitor prefers reduced motion.
 */
import { useState, useTransition } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { CircleAlert, CircleCheck, MailWarning } from "lucide-react"
import { resendConfirmationEmail, type ResendConfirmationResult } from "@/app/actions/email-confirmation"
import { Button } from "@/components/ui/button"

export function ConfirmEmailNotice({ email }: { email: string }) {
  const t = useTranslations("esign.confirmEmail")
  const reduceMotion = useReducedMotion()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ResendConfirmationResult | null>(null)

  function resend() {
    startTransition(async () => {
      setResult(await resendConfirmationEmail())
    })
  }

  const offset = reduceMotion ? 0 : -8
  const failed = result === "failed"
  const succeeded = result === "sent"

  return (
    <motion.section
      aria-labelledby="confirm-email-title"
      initial={{ opacity: 0, y: offset }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="mb-6 border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-500/5 p-4 sm:p-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="confirm-email-title" className="text-sm font-semibold text-foreground">
              {t("title")}
            </h2>
            <p className="mt-1 break-words text-sm text-muted-foreground">{t("body", { email })}</p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={pending}
          onClick={resend}
          className="w-full shrink-0 rounded-none sm:w-auto"
        >
          {failed ? t("retry") : t("resend")}
        </Button>
      </div>

      {/* Announced politely: the outcome of the button, not an interruption. */}
      <div role="status" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          {result && (
            <motion.p
              key={result}
              initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={
                failed
                  ? "mt-3 flex items-start gap-2 border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive"
                  : "mt-3 flex items-start gap-2 text-sm font-medium text-foreground"
              }
            >
              {failed && <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
              {succeeded && <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
              <span>{t(`result.${result}`)}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  )
}
