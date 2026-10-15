"use client"

/**
 * A small bar chart of weekly counts for the admin Analytics page (signups
 * per week), with each bar's figure readable without hovering.
 *
 * Plain elements rather than a chart library: twelve bars do not need one,
 * and this keeps the page light. The bars grow from the baseline in a short
 * stagger on first render (framer-motion); with prefers-reduced-motion they
 * are drawn at full height at once. The data is also given as a visually
 * hidden list for screen readers.
 */
import { motion, useReducedMotion } from "framer-motion"

export function WeeklyBars({ weeks, label }: { weeks: { label: string; count: number }[]; label: string }) {
  const reduceMotion = useReducedMotion()
  const max = Math.max(1, ...weeks.map((w) => w.count))
  return (
    <figure>
      <div aria-hidden className="flex h-40 items-end gap-1 sm:gap-2">
        {weeks.map((w, i) => (
          <div key={w.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <span className="text-[10px] tabular-nums text-muted-foreground sm:text-xs">{w.count}</span>
            <motion.div
              className="w-full origin-bottom bg-primary/80"
              style={{ height: `${Math.max(2, (w.count / max) * 100)}%` }}
              initial={reduceMotion ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, ease: "easeOut", delay: reduceMotion ? 0 : i * 0.03 }}
            />
          </div>
        ))}
      </div>
      <div aria-hidden className="mt-2 flex gap-1 sm:gap-2">
        {weeks.map((w, i) => (
          <span key={w.label} className="min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground">
            {i % 3 === 0 || i === weeks.length - 1 ? w.label : ""}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {label}
        <ul>
          {weeks.map((w) => (
            <li key={w.label}>
              {w.label}: {w.count}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  )
}
