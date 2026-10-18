"use client"

/**
 * Labelled horizontal bars for a few shares of a whole, such as visitors by
 * device on /admin/analytics/traffic. Each row names its category and gives
 * its figure and percentage in text, so the bar's length is a reading aid,
 * never the only carrier of the number. One colour for every bar: the label
 * says which is which.
 *
 * The bars grow from the left in a short stagger on first render; with
 * prefers-reduced-motion they are drawn at full length at once.
 */
import { motion, useReducedMotion } from "framer-motion"

export type ShareBar = { key: string; label: string; value: string; share: number }

export function ShareBars({ rows }: { rows: ShareBar[] }) {
  const reduceMotion = useReducedMotion()
  return (
    <ul className="space-y-3">
      {rows.map((row, i) => (
        <li key={row.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">
              {row.value}
              <span className="ml-2 text-xs font-normal text-muted-foreground">{Math.round(row.share * 100)}%</span>
            </span>
          </div>
          <div className="mt-1 h-2 bg-muted">
            <motion.div
              className="h-full origin-left bg-primary"
              style={{ width: `${Math.max(row.share * 100, row.share > 0 ? 1 : 0)}%` }}
              initial={reduceMotion ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.45, ease: "easeOut", delay: reduceMotion ? 0 : i * 0.06 }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
