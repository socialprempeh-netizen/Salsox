"use client"

/**
 * Signs the person out after a period without activity, when an admin has set
 * one (sessionTimeoutMinutes, /admin/security). Mounted by the dashboard and
 * admin layouts with the policy's number of minutes.
 *
 * Activity is a click, a tap, a key or a scroll, in any tab of this site: the
 * time of the last one is shared through localStorage, so a person working in
 * one tab is not signed out by another left in the background. A minute
 * before the limit a notice counts down with a button to stay; at the limit
 * the session ends on the server (authClient.signOut) and the page goes to
 * the sign-in screen, which says why.
 *
 * This is the browser's half. It cannot act on a machine that is asleep or a
 * tab that was closed, which the session's own expiry (src/auth.ts) covers.
 *
 * The notice slides up with framer-motion, or just appears with reduced
 * motion. Square corners; full width on a phone, a corner card from `sm`.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { TimerReset } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

const KEY = "sx-last-activity"
const WARN_MS = 60_000
const CHECK_MS = 1_000
const WRITE_EVERY_MS = 10_000

function readShared(): number {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

function writeShared(at: number) {
  try {
    window.localStorage.setItem(KEY, String(at))
  } catch {
    // Private windows can refuse storage; this tab still keeps its own time.
  }
}

export function IdleSignOut({ minutes }: { minutes: number }) {
  const t = useTranslations("dashboard.idle")
  const reduceMotion = useReducedMotion()
  const limit = minutes * 60_000
  const last = useRef(0)
  const lastWrite = useRef(0)
  const signingOut = useRef(false)
  const router = useRouter()
  const [remaining, setRemaining] = useState<number | null>(null)

  const touch = useCallback(() => {
    const now = Date.now()
    last.current = now
    if (now - lastWrite.current > WRITE_EVERY_MS) {
      lastWrite.current = now
      writeShared(now)
    }
  }, [])

  const stay = useCallback(() => {
    // Written at once, not throttled: the person asked to stay.
    const now = Date.now()
    last.current = now
    lastWrite.current = now
    writeShared(now)
    setRemaining(null)
  }, [])

  useEffect(() => {
    // Starts the clock without touching state: the notice is hidden already.
    const start = Date.now()
    last.current = start
    lastWrite.current = start
    writeShared(start)
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }))
    const timer = window.setInterval(() => {
      const left = limit - (Date.now() - Math.max(last.current, readShared()))
      if (left <= 0 && !signingOut.current) {
        signingOut.current = true
        window.clearInterval(timer)
        void authClient.signOut().finally(() => {
          router.replace("/login?reason=idle")
          router.refresh()
        })
        return
      }
      setRemaining(left <= WARN_MS ? left : null)
    }, CHECK_MS)
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch))
      window.clearInterval(timer)
    }
  }, [limit, touch, router])

  const seconds = remaining === null ? 0 : Math.max(0, Math.ceil(remaining / 1000))

  return (
    <AnimatePresence>
      {remaining !== null && (
        <motion.div
          role="alertdialog"
          aria-labelledby="idle-title"
          aria-describedby="idle-body"
          initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-x-4 bottom-4 z-50 border border-t-4 border-t-primary bg-card p-4 shadow-lg sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-80"
        >
          <div className="flex items-start gap-3">
            <TimerReset className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p id="idle-title" className="text-sm font-semibold">{t("title")}</p>
              {/* Not a live region: a count read out every second would drown the
                  page. The alertdialog role announces the notice once. */}
              <p id="idle-body" className="mt-0.5 text-sm text-muted-foreground">{t("body", { seconds })}</p>
              <Button type="button" onClick={stay} className="mt-3 h-10 w-full rounded-none">{t("stay")}</Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
