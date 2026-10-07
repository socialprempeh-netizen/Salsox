"use client"

/**
 * The upgrade prompts for plan-gated features (rules in src/lib/esign/plans.ts).
 *
 * Three pieces, so a gate always says why and offers the way past it instead
 * of failing silently or not at all:
 *
 * - `PlanLock`: the note under a control the plan does not include (Sign &
 *   Pay, signing order, approvers), naming the plan that does, with a link to
 *   billing.
 * - `FreeAllowanceNotice`: on the upload pages, a free account's documents
 *   left this month, and once spent, the upgrade.
 * - `useActionErrorToast`: shows an action's error, with an "Upgrade" button
 *   when the action said a plan would lift it (`ActionState.upgrade`).
 *
 * The server enforces every one of these on its own; this only tells the
 * sender before they try. Square corners, single column on phones, and a
 * short framer-motion entrance that drops the movement under reduced motion.
 */
import { useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Lock, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"

const BILLING = "/dashboard/billing"

/** Shown under a control the sender's plan does not include. */
export function PlanLock({ plan, className }: { plan: "Business" | "Personal"; className?: string }) {
  const t = useTranslations("esign.plans")
  const reduceMotion = useReducedMotion()
  return (
    <motion.p
      initial={{ opacity: 0, y: reduceMotion ? 0 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}
    >
      <span className="inline-flex items-center gap-1.5 border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary-hover">
        <Lock className="h-3 w-3" aria-hidden="true" />
        {t("planBadge", { plan })}
      </span>
      <span>{t("lockedHint", { plan })}</span>
      <Link href={BILLING} className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
        {t("upgrade")}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </motion.p>
  )
}

/**
 * A free account's monthly allowance. Renders nothing for paid plans
 * (`left` is null when unlimited).
 */
export function FreeAllowanceNotice({ left, total }: { left: number | null; total: number }) {
  const t = useTranslations("esign.plans")
  const reduceMotion = useReducedMotion()
  if (left === null) return null
  const spent = left === 0
  return (
    <motion.div
      role={spent ? "alert" : "status"}
      initial={{ opacity: 0, y: reduceMotion ? 0 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn(
        "flex flex-col gap-3 border border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between",
        spent ? "border-amber-500/40 border-l-amber-500 bg-amber-500/5" : "border-primary/20 border-l-primary bg-primary/5"
      )}
    >
      <div className="flex min-w-0 gap-3">
        <Sparkles className={cn("mt-0.5 h-5 w-5 shrink-0", spent ? "text-amber-600" : "text-primary")} aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {spent ? t("allowanceSpent", { total }) : t("allowanceLeft", { left, total })}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("allowanceBody")}</p>
        </div>
      </div>
      <Link
        href={BILLING}
        className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {t("allowanceCta")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </motion.div>
  )
}

/**
 * Shows an action error, offering the upgrade when a plan would lift it.
 * Stable across renders, so it can sit in an effect's dependencies without
 * re-running the effect (and repeating the toast) on every render.
 */
export function useActionErrorToast() {
  const t = useTranslations("esign.plans")
  const router = useRouter()
  return useCallback(
    (error: string, upgrade?: boolean) => {
      if (upgrade) toast.error(error, { action: { label: t("upgrade"), onClick: () => router.push(BILLING) } })
      else toast.error(error)
    },
    [t, router]
  )
}
