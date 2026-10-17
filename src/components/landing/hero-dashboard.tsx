"use client"

/**
 * The floating dashboard card beside the homepage headline (hero.tsx): a
 * compact picture of the Salsox dashboard, with the same data as the earlier
 * full mock-up (Ama Mensah's month: 24 sent, $4,800 collected, signed per
 * week, Kofi's paid service agreement), not invented figures. The amounts
 * are in dollars here only (they were cedis): the app itself keeps GH₵.
 *
 * A picture, so it is hidden from assistive technology: the headline beside
 * it already says what the product is (see hero-classic.tsx for the reasons).
 * The words arrive as props, already translated on the server, because the
 * public pages do not send the `hero.mock` messages to the browser.
 *
 * Motion (framer-motion): the card drifts gently up and down, and the "all
 * signed" chip floats on its own rhythm, so the two read as separate layers.
 * Both are still under prefers-reduced-motion. Nothing starts hidden: the
 * card paints at once, like the rest of the hero.
 */
import { motion, useReducedMotion } from "framer-motion"
import { BadgeCheck, FileSignature, Lock } from "lucide-react"

export type HeroDashboardText = {
  host: string
  greeting: string
  greetingBody: string
  sentLabel: string
  sentValue: string
  collectedLabel: string
  collectedValue: string
  chartTitle: string
  docTitle: string
  docBody: string
  open: string
  weekLabel: string
  weekValue: string
}

// Signed per week, as % of the tallest: the earlier mock-up's last seven bars.
const BARS = [45, 63, 58, 74, 69, 85, 100]

export function HeroDashboard({ text }: { text: HeroDashboardText }) {
  const reduceMotion = useReducedMotion()
  const drift = (distance: number, duration: number, delay = 0) =>
    reduceMotion ? {} : { animate: { y: [0, -distance, 0] }, transition: { duration, delay, repeat: Infinity, ease: "easeInOut" as const } }

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto">
      <motion.div {...drift(8, 7)} className="border border-border bg-card shadow-[var(--shadow-soft-lg)]">
        {/* Address bar: this product's own host. */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          <span className="truncate">{text.host}/dashboard</span>
          {/* Squared (was rounded-full), bright teal (was the primary). */}
          <span className="ml-auto h-2 w-2 shrink-0 bg-brand-teal" />
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="font-display text-xl font-semibold text-foreground">{text.greeting}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{text.greetingBody}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="border border-border bg-background p-3">
              <p className="whitespace-nowrap font-display text-2xl font-semibold text-primary sm:text-3xl">{text.sentValue}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{text.sentLabel}</p>
            </div>
            <div className="border border-border bg-background p-3">
              <p className="whitespace-nowrap font-display text-2xl font-semibold text-brand-accent-text sm:text-3xl">{text.collectedValue}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">{text.collectedLabel}</p>
            </div>
          </div>

          <div className="border border-border bg-background p-3">
            <p className="text-xs font-semibold text-foreground">{text.chartTitle}</p>
            <div className="mt-3 flex h-20 items-end gap-2">
              {BARS.map((h, i) => (
                // The week's bars in bright teal (were bg-primary/80), this week in purple.
                <div key={i} className={i === BARS.length - 1 ? "flex-1 bg-brand-accent" : "flex-1 bg-brand-teal/80"} style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 border border-border bg-background p-3">
            {/* Icon tile in bright teal (was primary). */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-brand-teal/10 text-brand-teal">
              <FileSignature className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{text.docTitle}</p>
              <p className="truncate text-xs text-muted-foreground">{text.docBody}</p>
            </div>
            <span className="shrink-0 border border-border px-2.5 py-1 text-xs font-medium text-foreground">{text.open}</span>
          </div>
        </div>
      </motion.div>

      {/* The week's status, floating over the card's corner. */}
      <motion.div
        {...drift(6, 5, 1.2)}
        className="absolute -bottom-5 left-3 flex items-center gap-2 border border-brand-accent/30 bg-card px-3 py-2 shadow-[var(--shadow-soft-lg)] sm:-left-8"
      >
        <span className="flex h-7 w-7 items-center justify-center bg-brand-accent text-white">
          <BadgeCheck className="h-4 w-4" />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] text-muted-foreground">{text.weekLabel}</span>
          <span className="block text-sm font-semibold text-foreground">{text.weekValue}</span>
        </span>
      </motion.div>
    </div>
  )
}
