/**
 * Building blocks shared by the admin console's section pages (overview,
 * users, documents, analytics, revenue, subscriptions, health, settings), so
 * eight pages written at once look like one product: the same header, stat
 * tiles, panels, money lines and window picker.
 *
 * Server components, square corners, mobile first: tiles stack two to a row on
 * a phone, panels are full width, and anything wide (a table) scrolls inside
 * its panel. Entrance motion comes from AdminReveal, which wraps panels in a
 * short staggered fade (and only fades under prefers-reduced-motion).
 */
import Link from "next/link"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { formatMinorUnits } from "@/lib/esign/payments/select"
import { currenciesOf, type CurrencyTotals } from "@/lib/admin/revenue"
import { cn } from "@/lib/utils"

export function AdminPageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <AdminReveal className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </AdminReveal>
  )
}

export type Tone = "default" | "good" | "warn" | "bad"

const TONE: Record<Tone, string> = {
  default: "text-foreground",
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-destructive",
}

/** One figure with its label, and an optional line of context under it. */
export function StatTile({ label, value, hint, tone = "default", href }: { label: string; value: React.ReactNode; hint?: string; tone?: Tone; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", TONE[tone])}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  return href ? (
    <Link href={href} className="block border border-border bg-card p-4 transition-colors hover:border-primary/50">
      {body}
    </Link>
  ) : (
    <div className="border border-border bg-card p-4">{body}</div>
  )
}

export function StatGrid({ children, index = 1 }: { children: React.ReactNode; index?: number }) {
  return (
    <AdminReveal index={index} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {children}
    </AdminReveal>
  )
}

/** A titled block of the page. `flush` drops the body padding, for lists and tables. */
export function Panel({
  title,
  hint,
  action,
  index = 2,
  flush = false,
  className,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  index?: number
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <AdminReveal index={index} className={cn("min-w-0 border border-border bg-card", className)}>
      <div className="flex flex-col gap-2 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
        {/* Its own size, not stretched across the header when it stacks on a phone. */}
        {action && <div className="shrink-0 self-start">{action}</div>}
      </div>
      <div className={flush ? "" : "p-4"}>{children}</div>
    </AdminReveal>
  )
}

/** A table that scrolls inside its panel on a phone instead of widening the page. */
export function ScrollTable({ children, minWidth = "36rem" }: { children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-2.5 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>
}

/** Formats minor units in their currency. */
export const money = (amount: number, currency: string) => formatMinorUnits(amount, currency)

/**
 * Per-currency amounts, one per line, largest first: never added together
 * here (see src/lib/admin/revenue.ts for when a combined total is allowed).
 */
export function CurrencyAmounts({ totals, empty, className }: { totals: CurrencyTotals; empty: string; className?: string }) {
  const currencies = currenciesOf(totals).filter((c) => totals[c] !== 0)
  if (currencies.length === 0) return <span className={cn("text-muted-foreground", className)}>{empty}</span>
  return (
    <span className={cn("flex flex-col tabular-nums", className)}>
      {currencies.map((c) => (
        <span key={c}>{money(totals[c], c)}</span>
      ))}
    </span>
  )
}

/** Links that switch the page's period (?days=7|30|90), current one marked. */
export function WindowPicker({ path, current, windows, label, format }: { path: string; current: number; windows: readonly number[]; label: string; format: (days: number) => string }) {
  return (
    <nav aria-label={label} className="flex w-max border border-border">
      {windows.map((days) => (
        <Link
          key={days}
          href={`${path}?days=${days}`}
          aria-current={days === current ? "page" : undefined}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors [&+&]:border-l [&+&]:border-border",
            days === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {format(days)}
        </Link>
      ))}
    </nav>
  )
}

/** A short status chip: good, warn, bad or neutral. */
export function Chip({ tone = "default", children }: { tone?: Tone; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    default: "border-border bg-muted/40 text-muted-foreground",
    good: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    bad: "border-destructive/40 bg-destructive/10 text-destructive",
  }
  return <span className={cn("inline-flex items-center border px-1.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>
}
