"use client"

/**
 * The invited person's side of a referral (src/lib/referrals.ts), so both
 * sides know what makes an invite count:
 *
 * - "signup": on the signup page when the visitor arrived through an invite
 *   link (the sx_ref cookie holds a code). The inviter is not named: the
 *   invite route never looks a code up, so nothing here can be used to learn
 *   whose a code is.
 * - "dashboard": on the dashboard home of an account that joined through an
 *   invite and has not sent a document yet, with the way to send one.
 *
 * Fades and lifts in with framer-motion; plain under reduced motion. Square
 * corners.
 */
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Gift } from "lucide-react"
import { Button } from "@/components/ui/button"

export function InviteNotice({ variant, months }: { variant: "signup" | "dashboard"; months: number }) {
  const t = useTranslations("referralInvite")
  const reduceMotion = useReducedMotion()
  const body = variant === "dashboard" ? t("dashboardBody", { months }) : t("signupBody", { months })
  return (
    <motion.aside
      initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.3, ease: "easeOut" }}
      aria-label={t("title")}
      className={variant === "signup" ? "mb-6 border border-primary/30 bg-primary/5 p-4" : "border border-primary/30 bg-primary/5 p-4 sm:p-5"}
    >
      <div className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{t("title")}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{body}</p>
          {variant === "dashboard" && (
            <Button asChild size="sm" className="mt-3 rounded-none">
              <Link href="/dashboard/documents/quick-send">{t("dashboardCta")}</Link>
            </Button>
          )}
        </div>
      </div>
    </motion.aside>
  )
}
