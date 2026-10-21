"use client"

/**
 * A rate drawn as a row of square segments, the admin console's progress
 * indicator: completion on a stat tile, a step of the signup funnel, the SEO
 * agent's review period. Squares rather than a smooth bar because every box
 * in the product is square, and because a count of lit squares reads at a
 * glance where a bar's length has to be estimated.
 *
 * How many light is decided by filledSegments (src/lib/admin/meter.ts). The
 * lit squares fill left to right in a short stagger the first time the meter
 * scrolls into view (framer-motion); under prefers-reduced-motion they are
 * simply lit.
 */
import { motion, useReducedMotion } from "framer-motion"
import { filledSegments } from "@/lib/admin/meter"
import { cn } from "@/lib/utils"

export type MeterTone = "default" | "info" | "good" | "warn" | "bad" | "accent"

const FILL: Record<MeterTone, string> = {
  default: "bg-primary",
  info: "bg-primary",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-destructive",
  accent: "bg-brand-accent",
}

export function SegmentMeter({
  value,
  segments = 12,
  tone = "default",
  label,
  size = "sm",
  className,
}: {
  /** 0 to 1; null draws an empty meter. */
  value: number | null
  segments?: number
  tone?: MeterTone
  /** Names the meter for screen readers, e.g. "Completion rate". */
  label: string
  size?: "sm" | "md"
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const lit = filledSegments(value, segments)
  const percent = value === null ? 0 : Math.round(Math.min(1, Math.max(0, value)) * 100)

  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("flex gap-[3px]", className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span key={i} className={cn("relative flex-1 bg-muted", size === "sm" ? "h-1.5" : "h-2.5")}>
          {i < lit && (
            <motion.span
              aria-hidden
              className={cn("absolute inset-0 origin-left", FILL[tone])}
              initial={reduceMotion ? false : { scaleX: 0, opacity: 0 }}
              whileInView={{ scaleX: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.22, ease: "easeOut", delay: reduceMotion ? 0 : 0.15 + i * 0.035 }}
            />
          )}
        </span>
      ))}
    </div>
  )
}
