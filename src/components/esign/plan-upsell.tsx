"use client"

/**
 * The upgrade prompts for plan-gated features (rules in src/lib/esign/plans.ts).
 *
 * Four pieces, so a gate always says why and offers the way past it instead
 * of failing silently or not at all:
 *
 * - `PlanLock`: the note under a control the plan does not include (Sign &
 *   Pay, signing order, approvers), naming the plan that does, with a link to
 *   billing.
 * - `FreeAllowanceNotice`: on the upload pages, a free account's documents
 *   left this month, and once spent, the upgrade.
 * - `RequestLimitReached`: in place of Quick Send's form when it opens with a
 *   request from the public request-a-signature tool whose one free use is
 *   spent, with what each plan adds and the way to billing.
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
 * Takes the place of Quick Send's form when a free account arrives from the
 * request-a-signature tool having used its one free request from it
 * (FREE_REQUEST_TOOL_USES in plans.ts; for a while this gated every send,
 * account-wide). Rather than letting the sender fill in a form the engine
 * will refuse, it says the tool's free use is spent,
 * what each plan adds, and goes to billing. Children enter one after another
 * (a short stagger, no movement under reduced motion), so the eye lands on
 * the heading first and the plans second.
 */
export function RequestLimitReached({ total }: { total: number }) {
  const t = useTranslations("esign.plans")
  const reduceMotion = useReducedMotion()
  const item = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 8 },
    shown: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
  }
  const plans = [
    { name: t("limitPersonalName"), body: t("limitPersonal") },
    { name: t("limitBusinessName"), body: t("limitBusiness") },
  ]
  return (
    <motion.section
      role="alert"
      aria-labelledby="request-limit-title"
      initial="hidden"
      animate="shown"
      variants={{ hidden: {}, shown: { transition: { staggerChildren: reduceMotion ? 0 : 0.06 } } }}
      // The accent edge is a border colour again now that globals.css sets
      // the default border colour inside @layer base, below the utilities.
      // It was drawn as a bar while that rule outranked them:
      //   className="relative border bg-card p-5 pt-6 sm:p-8 sm:pt-9"
      //   <span aria-hidden="true" className="absolute inset-x-0 -top-px h-1 bg-primary" />
      className="border border-t-4 border-t-primary bg-card p-5 sm:p-8"
    >
      <motion.span variants={item} className="flex h-11 w-11 items-center justify-center border border-primary/30 bg-primary/10 text-primary">
        <Lock className="h-5 w-5" aria-hidden="true" />
      </motion.span>
      <motion.h2 variants={item} id="request-limit-title" className="mt-5 text-xl font-bold tracking-tight sm:text-2xl">
        {t("limitTitle", { total })}
      </motion.h2>
      <motion.p variants={item} className="mt-2 max-w-prose text-sm text-muted-foreground sm:text-base">
        {t("limitBody", { total })}
      </motion.p>
      <motion.dl variants={item} className="mt-6 divide-y divide-border border-y border-border">
        {plans.map((plan) => (
          <div key={plan.name} className="grid gap-1 py-3 sm:grid-cols-[8rem_1fr] sm:gap-4">
            <dt className="text-sm font-semibold text-foreground">{plan.name}</dt>
            <dd className="text-sm text-muted-foreground">{plan.body}</dd>
          </div>
        ))}
      </motion.dl>
      <motion.div variants={item} className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link
          href={BILLING}
          className="group inline-flex h-11 items-center justify-center gap-1.5 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {t("limitCta")}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
        <Link
          href="/dashboard/documents"
          className="inline-flex h-11 items-center justify-center border border-border px-5 text-sm font-medium transition-colors hover:bg-accent"
        >
          {t("limitBack")}
        </Link>
      </motion.div>
    </motion.section>
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
