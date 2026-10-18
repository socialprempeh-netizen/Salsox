"use client"

/**
 * The date range control on /admin/analytics/traffic: three quick ranges
 * (?days=7|30|90) and a custom one (?from=&to=), all in the URL so a range
 * can be bookmarked or shared with another admin.
 *
 * The custom range opens a small panel with two native date inputs, which
 * on a phone bring up the system's own date picker. It slides open
 * (framer-motion), or simply appears with prefers-reduced-motion. The server
 * re-checks whatever arrives (resolveRange in src/lib/admin/traffic.ts); the
 * input limits here only save a round trip.
 */
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type RangePickerLabels = { period: string; days: Record<number, string>; custom: string; from: string; to: string; apply: string }

export function TrafficRangePicker({
  path,
  presets,
  current,
  start,
  end,
  today,
  labels,
}: {
  path: string
  presets: readonly number[]
  /** The preset in use, or null for a custom range. */
  current: number | null
  start: string
  end: string
  today: string
  labels: RangePickerLabels
}) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState(current === null)
  const [from, setFrom] = useState(start)
  const [to, setTo] = useState(end)
  const item = "px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary [&+&]:border-l [&+&]:border-border"

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <nav aria-label={labels.period} className="flex w-max border border-border">
        {presets.map((days) => (
          <Link
            key={days}
            href={`${path}?days=${days}`}
            aria-current={days === current ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={cn(item, days === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {labels.days[days]}
          </Link>
        ))}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="traffic-custom-range"
          onClick={() => setOpen((o) => !o)}
          className={cn(item, current === null ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
        >
          {labels.custom}
        </button>
      </nav>

      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            id="traffic-custom-range"
            initial={{ opacity: 0, height: reduceMotion ? "auto" : 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: reduceMotion ? "auto" : 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, ease: "easeOut" }}
            className="w-full overflow-hidden sm:w-auto"
            onSubmit={(e) => {
              e.preventDefault()
              if (from && to) router.push(`${path}?from=${from}&to=${to}`)
            }}
          >
            <div className="flex flex-wrap items-end gap-2 border border-border bg-card p-3">
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
                {labels.from}
                <input type="date" required value={from} max={to || today} min="2015-08-14" onChange={(e) => setFrom(e.target.value)} className="h-9 border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary" />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground sm:flex-none">
                {labels.to}
                <input type="date" required value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} className="h-9 border border-input bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-primary" />
              </label>
              <Button type="submit" size="sm" className="w-full sm:w-auto">{labels.apply}</Button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}
