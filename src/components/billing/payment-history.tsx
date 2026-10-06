"use client"

/**
 * Every past payment on the billing page, each with its PDF receipt.
 *
 * Rows arrive finished from the page (dates, amounts and labels formatted on
 * the server, receipt links from src/lib/receipts.ts), so this only lays them
 * out and animates them in. A stacked list rather than a table: four columns
 * do not fit a 360px phone, and a table that scrolls sideways hides the
 * download button, which is the point of the row.
 *
 * Square corners per the design rules. Rows enter with a short framer-motion
 * stagger, without the slide under prefers-reduced-motion.
 */
import { motion, useReducedMotion } from "framer-motion"
import { Download, ExternalLink, Receipt as ReceiptIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type PaymentHistoryRow = {
  key: string
  date: string
  description: string
  /** "Subscription", "One-time purchase", "Sign & Pay": already translated. */
  kindLabel: string
  provider: "Stripe" | "Paystack"
  amount: string
  status: string
  statusLabel: string
  receiptHref: string | null
  invoiceHref: string | null
}

const STATUS_STYLES: Record<string, string> = {
  paid: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  refunded: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  open: "border-primary/30 bg-primary/10 text-primary",
}

export function PaymentHistory({
  rows,
  labels,
}: {
  rows: PaymentHistoryRow[]
  labels: { receipt: string; invoice: string; empty: string; receiptFor: string }
}) {
  const reduceMotion = useReducedMotion()

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 border border-dashed border-border px-4 py-10 text-center">
        <ReceiptIcon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{labels.empty}</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border border border-border">
      {rows.map((row, i) => (
        <motion.li
          key={row.key}
          initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut", delay: reduceMotion ? 0 : Math.min(i, 8) * 0.04 }}
          className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3 sm:block">
              <p className="min-w-0 truncate text-sm font-medium" title={row.description}>{row.description}</p>
              <p className="shrink-0 text-sm font-semibold tabular-nums sm:hidden">{row.amount}</p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{row.date}</span>
              <span aria-hidden="true">·</span>
              <span>{row.kindLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{row.provider}</span>
              <span className={cn("border px-1.5 py-px font-medium", STATUS_STYLES[row.status] ?? "border-border bg-secondary text-muted-foreground")}>
                {row.statusLabel}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <p className="hidden text-sm font-semibold tabular-nums sm:block">{row.amount}</p>
            {row.invoiceHref && (
              <a
                href={row.invoiceHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-1.5 border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {labels.invoice} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
            {row.receiptHref && (
              // A file from a route handler: a real navigation with `download`,
              // never a client-side transition.
              <a
                href={row.receiptHref}
                download
                aria-label={`${labels.receiptFor} ${row.description}, ${row.date}`}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:flex-none"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> {labels.receipt}
              </a>
            )}
          </div>
        </motion.li>
      ))}
    </ul>
  )
}
