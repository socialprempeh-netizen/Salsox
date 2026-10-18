"use client"

/**
 * The analytics consent banner, and the footer button that reopens it.
 * Mounted by google-analytics.tsx, so it only exists on a deployment that
 * runs GA: the other analytics here are cookieless and need no consent.
 *
 * It asks once per device (the choice is kept by src/lib/analytics-consent.ts
 * and asked again after about a year), never on signing pages, and never
 * when the browser sends Global Privacy Control or Do Not Track. Accept and
 * Decline are the same size, side by side, because refusing must be as easy
 * as agreeing. It shows after the page is idle, so it never competes with
 * the page's own content for a phone's first paint, and it slides in from
 * the bottom edge, or only fades when the visitor prefers reduced motion.
 */
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CONSENT_OPEN_EVENT, browserOptedOut, isMeasuredPath, openConsent, readConsent, saveConsent, type ConsentChoice } from "@/lib/analytics-consent"

export function ConsentBanner({ policyHref }: { policyHref: string }) {
  const t = useTranslations("consent")
  const pathname = usePathname()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (browserOptedOut(navigator as Navigator & { globalPrivacyControl?: boolean })) return
    const show = () => setOpen(true)
    window.addEventListener(CONSENT_OPEN_EVENT, show)
    let idle: number | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    if (readConsent() === null) {
      // Safari has no requestIdleCallback: a short timeout stands in for it.
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(show, { timeout: 3000 })
      else timer = setTimeout(show, 1500)
    }
    return () => {
      window.removeEventListener(CONSENT_OPEN_EVENT, show)
      if (idle !== null) window.cancelIdleCallback(idle)
      if (timer !== null) clearTimeout(timer)
    }
  }, [])

  const choose = (choice: ConsentChoice) => {
    saveConsent(choice)
    setOpen(false)
  }

  return (
    <AnimatePresence>
      {open && isMeasuredPath(pathname) && (
        <motion.section
          key="consent"
          role="region"
          aria-labelledby="consent-title"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 24 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          // Full width along the bottom of a phone, with the home indicator's
          // inset; a compact panel in the corner from sm up, clear of the
          // hero's call to action. The teal top edge is its one accent.
          className="fixed inset-x-0 bottom-0 z-[60] border-t-2 border-t-brand-teal bg-card px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-card-foreground shadow-[var(--shadow-soft-lg)] sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[380px] sm:border-x sm:border-b sm:border-x-border sm:border-b-border sm:p-5"
        >
          <h2 id="consent-title" className="text-[15px] font-semibold leading-snug">{t("title")}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {t("body")}{" "}
            <Link href={policyHref} className="font-medium text-foreground underline underline-offset-4 hover:text-primary-hover">
              {t("policy")}
            </Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" size="sm" onClick={() => choose("denied")}>{t("decline")}</Button>
            <Button size="sm" onClick={() => choose("granted")}>{t("accept")}</Button>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  )
}

/** The footer's "Cookie settings": reopens the banner to change the choice. */
export function ConsentSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("consent")
  return (
    <button type="button" onClick={openConsent} className={className}>
      {t("settings")}
    </button>
  )
}
