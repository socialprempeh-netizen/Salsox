"use client"

/**
 * A one-time suggestion to turn on 2FA, for people who can receive money
 * through a Stripe or Paystack payout account (the rule is in
 * src/lib/two-factor-policy.ts). A suggestion, not a gate: it links to the
 * setup in Settings and can be dismissed for good, which is stored on the
 * account (dismissTwoFactorNudge), so it does not come back on another device.
 *
 * Dismissing hides it at once, before the server answers; it leaves with a
 * short collapse through framer-motion, or simply disappears with reduced
 * motion. Square corners, stacks below `sm`.
 */
import { useState, useTransition } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { ShieldCheck, X } from "lucide-react"
import { dismissTwoFactorNudge } from "@/app/actions/two-factor"
import { Button } from "@/components/ui/button"

export function TwoFactorNudge() {
  const t = useTranslations("dashboard.twoFactorNudge")
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(true)
  const [, startTransition] = useTransition()

  function dismiss() {
    setOpen(false)
    startTransition(() => dismissTwoFactorNudge())
  }

  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          aria-labelledby="two-factor-nudge-title"
          initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25 }}
          className="relative overflow-hidden border border-l-4 border-l-primary bg-card"
        >
          <div className="flex flex-col gap-3 p-4 pr-12 sm:flex-row sm:items-center sm:gap-4">
            <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 id="two-factor-nudge-title" className="text-sm font-semibold">{t("title")}</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">{t("body")}</p>
            </div>
            <Button asChild size="sm" className="w-full shrink-0 rounded-none sm:w-auto">
              <Link href="/dashboard/settings#two-factor">{t("action")}</Link>
            </Button>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t("dismiss")}
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
