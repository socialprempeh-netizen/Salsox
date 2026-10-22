"use client"

/**
 * The signup call to action a free tool shows once the visitor has finished
 * with it: after the signed PDF downloads, or the signature image does. The
 * copy is specific to the tool and to what was just done ("signed; need
 * someone else to sign?"), which is the moment the next step makes sense.
 * The page's own calls to action further down stay as they are.
 *
 * Signed-in visitors are sent to Quick Send instead of signup
 * (afterToolCtaHref in src/lib/landing-cta.ts). It can be dismissed, and it
 * comes back the next time the visitor finishes.
 *
 * Motion: a short rise and fade in (framer-motion's `m`, inside the tools'
 * LazyMotion), a plain fade under prefers-reduced-motion. Square corners.
 */
import Link from "next/link"
import { useTranslations } from "next-intl"
import { m, useReducedMotion } from "framer-motion"
import { ArrowRight, CircleCheck, X } from "lucide-react"
import { useSignedIn } from "@/components/landing/session-aware"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import { afterToolCtaHref } from "@/lib/landing-cta"
import { track } from "@/lib/analytics"
import { AnimatePresence } from "./tool-motion"

export type AfterToolId = "sign-pdf" | "add-signature-to-pdf" | "fill-and-sign-pdf" | "pdf-signature-generator"

export function AfterToolCta({ tool, show, onDismiss }: { tool: AfterToolId; show: boolean; onDismiss: () => void }) {
  const t = useTranslations("tools.afterCta")
  const signedIn = useSignedIn()
  const reduce = useReducedMotion()
  const href = afterToolCtaHref(signedIn)

  return (
    <AnimatePresence initial={false}>
      {show && (
        <m.aside
          key="after-cta"
          aria-labelledby={`after-cta-${tool}`}
          initial={{ opacity: 0, y: reduce ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduce ? 0 : 6 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative border border-primary/40 border-l-4 border-l-primary bg-card p-4 pr-12 sm:p-5 sm:pr-14"
        >
          <button type="button" onClick={onDismiss} aria-label={t("dismiss")} className="absolute right-1 top-1 inline-flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
          <p id={`after-cta-${tool}`} className="flex items-start gap-2 font-semibold text-foreground">
            <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            {t(`${tool}.title`)}
          </p>
          <p className="mt-1.5 text-sm text-muted-foreground">{t(`${tool}.body`, { count: FREE_DOCUMENTS_PER_MONTH })}</p>
          <Link
            href={href}
            onClick={() => track("cta_clicked", { location: `tool-after:${tool}`, target: signedIn ? "quick-send" : "signup" })}
            className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 bg-primary px-5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
          >
            {signedIn ? t("buttonSignedIn") : t("button")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </m.aside>
      )}
    </AnimatePresence>
  )
}
