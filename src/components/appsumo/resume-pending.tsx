"use client"

/**
 * Redeems the AppSumo license key a visitor entered before signing in
 * (src/app/actions/appsumo.ts), on their first dashboard visit afterwards,
 * then shows the outcome on /dashboard/redeem.
 *
 * Mounted by the dashboard layout only while the pending-key cookie exists.
 * A client step rather than a redirect from the layout: the sign-in actions
 * render /dashboard in the same response as their redirect, and a redirect
 * from there through a route handler left the next page blank. The action
 * clears the cookie, so this runs once.
 */
import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { motion, useReducedMotion } from "framer-motion"
import { Loader2 } from "lucide-react"
import { resumePendingRedemptionAction } from "@/app/actions/appsumo"

export function ResumePendingRedemption() {
  const t = useTranslations("appsumo")
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    resumePendingRedemptionAction().then((outcome) => {
      router.replace(`/dashboard/redeem?result=${encodeURIComponent(outcome)}`)
      router.refresh()
    })
  }, [router])

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed inset-x-4 top-20 z-50 mx-auto flex max-w-md items-center gap-3 border border-primary/30 bg-background p-4 text-sm shadow-[var(--shadow-soft-lg)]"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
      {t("resuming")}
    </motion.div>
  )
}
