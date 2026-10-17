"use client"

/**
 * A sequential document's signing order as a short vertical list: one row per
 * step, with who is in it and, once the document is out, whether the step is
 * done, current or still waiting.
 *
 * Shared by the editor (a live preview while the sender sets the order, no
 * states) and the document page (progress). The steps themselves come from
 * `signingSteps` in src/lib/esign/signing-steps.ts; this only draws them.
 * Rows animate in and re-flow with framer-motion when the order changes, and
 * the current step's marker pulses once a second to show where things are;
 * both are switched off under prefers-reduced-motion.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Check } from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import type { StepState } from "@/lib/esign/signing-steps"
import { cn } from "@/lib/utils"

export type StepView = {
  /** Stable across re-renders, for the row animation. */
  key: string
  number: number
  names: string[]
  /** Absent in the editor's preview, where nothing has been sent yet. */
  state?: StepState
}

export function SigningStepList({ steps, className }: { steps: StepView[]; className?: string }) {
  const t = useTranslations("esign.steps")
  const format = useFormatter()
  const reduceMotion = useReducedMotion()

  return (
    <ol className={cn("relative", className)} aria-label={t("label")}>
      <AnimatePresence initial={false}>
        {steps.map((s, i) => (
          <motion.li
            key={s.key}
            layout={!reduceMotion}
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="relative flex gap-3 pb-4 last:pb-0"
            aria-current={s.state === "current" ? "step" : undefined}
          >
            {/* The line joining this step to the next. */}
            {i < steps.length - 1 && <span aria-hidden className="absolute bottom-0 left-3 top-6 w-px -translate-x-1/2 bg-border" />}
            <span className="relative flex h-6 w-6 shrink-0">
              {s.state === "current" && !reduceMotion && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 border border-primary"
                  initial={{ opacity: 0.6, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.6 }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <span
                className={cn(
                  "relative flex h-6 w-6 items-center justify-center border text-xs font-semibold tabular-nums",
                  s.state === "done"
                    ? "border-primary bg-primary text-primary-foreground"
                    : s.state === "current"
                      ? "border-primary bg-background text-primary"
                      : "bg-background text-muted-foreground"
                )}
              >
                {s.state === "done" ? <Check className="h-3.5 w-3.5" aria-hidden /> : s.number}
              </span>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{t("step", { n: s.number })}</p>
                {s.state && (
                  <p className={cn("shrink-0 text-xs", s.state === "current" ? "font-medium text-primary" : "text-muted-foreground")}>
                    {t(`state.${s.state}`)}
                  </p>
                )}
              </div>
              <p className="break-words text-sm text-muted-foreground">{format.list(s.names, { type: "conjunction" })}</p>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  )
}
