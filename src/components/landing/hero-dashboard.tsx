"use client"

/**
 * The dashboard card beside the homepage headline (hero.tsx), rebuilt from
 * the reference build (docs/reference/salsox-homepage-live.html). Every
 * colour, size, spacing and shadow below is that file's own value, read from
 * its CSS: a white card (18px padding) with a deep teal-tinted shadow, a
 * browser bar, the greeting, two stat tiles (the pale "active docs" tile and
 * the dark teal "paid out" tile), the signed-per-week chart, and a "contract
 * signed" chip floating over the corner from lg.
 *
 * Three departures from the file, all deliberate:
 * - Square corners, per the site-wide rule (CLAUDE.md), where the reference
 *   rounds the card (24px), tiles (16px), pills and bars. The window dots
 *   and the avatar stay round: they are marks, not boxes.
 * - The chart and the small bars draw. In the reference they are percentage
 *   heights inside columns with no height of their own, so every bar renders
 *   0px tall and the chart is empty; here the columns span the chart's
 *   height, so the same percentages (38, 72, 52, 88, 64, 92, 46) show.
 * - Small text clears 4.5:1, which several of the reference's values do not
 *   (axe checks this card's text even though it is aria-hidden): its 40%
 *   and 50% blacks (2.8 and 3.9:1) are 55% here, "Paid out" is 60% white
 *   (was 50%, 4.2:1), and the "+6" is dark teal on its tint (the teal
 *   was 3.3:1).
 *
 * Amounts are in dollars here only: the app itself keeps GH₵.
 *
 * A picture, so it is hidden from assistive technology: the headline beside
 * it already says what the product is. The words arrive as props, translated
 * on the server, because the public pages do not send `hero.mock` to the
 * browser. Dark mode swaps the reference's light-page colours for the
 * theme's tokens.
 *
 * Motion (framer-motion), the reference's two keyframes: the card rises 12px
 * and tilts from -0.5deg to 0.5deg over 6s, and the chip rises 6px over 5s,
 * so the two read as separate layers. Both stop under prefers-reduced-motion.
 * Nothing starts hidden: the card paints at once, like the rest of the hero.
 */
import { motion, useReducedMotion } from "framer-motion"
import { FileSearch, Globe } from "lucide-react"

export type HeroDashboardText = {
  host: string
  welcome: string
  name: string
  today: string
  export: string
  activeLabel: string
  activeValue: string
  activeDelta: string
  paidLabel: string
  paidValue: string
  paidStatus: string
  chartTitle: string
  chartMeta: string
  /** One letter per weekday, Monday first. */
  days: string[]
  chipTitle: string
  chipBody: string
}

// The reference's data: signed per day (% of the chart's height) and the
// small bars in the active-docs tile (% of their 24px row).
const WEEK = [38, 72, 52, 88, 64, 92, 46]
const ACTIVE = [40, 65, 35, 80, 50]

// The reference's shadows, as written in its CSS.
const CARD_SHADOW = "shadow-[0_24px_64px_rgba(11,61,58,0.18),0_2px_8px_rgba(0,0,0,0.06)]"
const CHIP_SHADOW = "shadow-[0_16px_40px_rgba(0,0,0,0.12)]"

export function HeroDashboard({ text }: { text: HeroDashboardText }) {
  const reduceMotion = useReducedMotion()
  const loop = { repeat: Infinity, ease: "easeInOut" as const }
  const cardFloat = reduceMotion ? {} : { animate: { y: [0, -12, 0], rotate: [-0.5, 0.5, -0.5] }, transition: { duration: 6, ...loop } }
  const chipFloat = reduceMotion ? {} : { animate: { y: [0, -6, 0] }, transition: { duration: 5, ...loop } }

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[560px] lg:ml-auto lg:mr-0">
      {/* The soft white halo behind the card, from lg (reference: white at
          40%, blurred 20px). */}
      <div className="absolute inset-0 -z-10 hidden bg-white/40 blur-[20px] lg:block dark:bg-white/5" />

      <motion.div {...cardFloat} className={`relative bg-white p-[18px] ring-1 ring-black/[0.04] ${CARD_SHADOW} dark:bg-card dark:ring-white/10`}>
        {/* Browser bar: window dots, the address, the avatar. */}
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex shrink-0 gap-1.5">
              <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
              <span className="h-3 w-3 rounded-full bg-[#FFBD2E]" />
              <span className="h-3 w-3 rounded-full bg-[#28CA42]" />
            </div>
            <div className="ml-3 flex h-[28px] min-w-0 items-center gap-2 bg-[#F5F5F5] px-3 text-[12px] text-black/60 dark:bg-muted dark:text-muted-foreground">
              <Globe className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{text.host}/dashboard</span>
            </div>
          </div>
          <div className="h-7 w-7 shrink-0 rounded-full bg-[#0B3D3A] dark:bg-primary" />
        </div>

        {/* Greeting, and the two range buttons. */}
        <div className="mt-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] text-black/55 dark:text-muted-foreground">{text.welcome}</div>
            <div className="font-display text-[22px] font-bold tracking-tight text-[#0B3D3A] dark:text-foreground">{text.name}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <span className="bg-[#F5F5F5] px-3 py-1.5 text-[11px] font-semibold text-[#0B3D3A] dark:bg-muted dark:text-foreground">{text.today}</span>
            <span className="bg-[#0B3D3A] px-3 py-1.5 text-[11px] font-semibold text-white">{text.export}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {/* Active documents: pale mint tile, a teal hairline. */}
          <div className="bg-[#F8FFFE] p-4 ring-1 ring-[#11928F]/10 dark:bg-muted">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-black/55 dark:text-muted-foreground">{text.activeLabel}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-[28px] font-bold tracking-tight text-[#0B3D3A] dark:text-foreground">{text.activeValue}</span>
              <span className="bg-[#11928F]/10 px-2 py-0.5 text-[11px] font-semibold text-[#0B3D3A] dark:text-foreground">{text.activeDelta}</span>
            </div>
            <div className="mt-3 flex h-6 items-end gap-1">
              {ACTIVE.map((h, i) => (
                <div key={i} className="w-full bg-[#11928F]/20" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>

          {/* Paid out: the dark teal tile, white type, the Stripe status. */}
          <div className="bg-[#0B3D3A] p-4 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-white/60">{text.paidLabel}</div>
            <div className="mt-1 whitespace-nowrap text-[28px] font-bold tracking-tight">{text.paidValue}</div>
            {/* Wraps rather than truncating: on a phone the tile is ~150px
                and "Stripe connected" was cut off. */}
            <div className="mt-3 inline-flex max-w-full items-center gap-1 bg-white/10 px-2 py-1 text-[11px] leading-tight">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#28CA42]" />
              <span>{text.paidStatus}</span>
            </div>
          </div>
        </div>

        {/* Signed per week. */}
        <div className="mt-5 border border-black/[0.06] bg-white p-4 dark:border-white/10 dark:bg-card">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[13px] font-semibold text-[#0B3D3A] dark:text-foreground">{text.chartTitle}</div>
            <div className="truncate text-[11px] text-black/55 dark:text-muted-foreground">{text.chartMeta}</div>
          </div>
          <div className="mt-4 flex h-[96px] gap-[10px]">
            {WEEK.map((h, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                {/* The column spans the chart, so the bar's % has a height
                    to resolve against (it does not, in the reference). */}
                <div className="flex w-full flex-1 items-end">
                  <div className="w-full bg-[#11928F] transition-colors hover:bg-[#0B3D3A]" style={{ height: `${h}%` }} />
                </div>
                <span className="text-[10px] font-medium text-black/55 dark:text-muted-foreground">{text.days[i]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* The chip over the corner, from lg as in the reference. */}
        <motion.div
          {...chipFloat}
          className={`absolute -bottom-4 -right-2 hidden max-w-[200px] items-center gap-3 bg-white p-3 ring-1 ring-black/5 lg:flex ${CHIP_SHADOW} dark:bg-card dark:ring-white/10`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-[#4C1D95] text-white">
            <FileSearch className="h-[18px] w-[18px]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[12px] font-semibold text-[#0B3D3A] dark:text-foreground">{text.chipTitle}</div>
            <div className="truncate text-[11px] text-black/55 dark:text-muted-foreground">{text.chipBody}</div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}
