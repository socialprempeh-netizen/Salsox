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
 *
 * The visual language is square signals: a tinted square icon beside each
 * figure and panel title, a 2px rule along the top of a stat tile in its
 * status colour, square status dots on chips, square nodes on a timeline and
 * the segmented meter (segment-meter.tsx) for rates. Colours come from the
 * theme tokens only (teal primary, violet brand accent, and emerald, amber
 * and red for status), so a deployment's brand carries through.
 */
import Link from "next/link"
import { ArrowUpRight, CheckCircle2, CircleAlert, Info, OctagonAlert, type LucideIcon } from "lucide-react"
import { AdminReveal } from "@/components/admin/admin-reveal"
import { SegmentMeter, type MeterTone } from "@/components/admin/segment-meter"
import { formatMinorUnits } from "@/lib/esign/payments/select"
import { currenciesOf, type CurrencyTotals } from "@/lib/admin/revenue"
import { cn } from "@/lib/utils"

/** A status colour: neutral, the brand's teal (info) or violet (accent), or good, warn, bad. */
export type Tone = MeterTone

const TONE: Record<Tone, string> = {
  default: "text-foreground",
  info: "text-primary-hover dark:text-primary",
  good: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-destructive",
  accent: "text-brand-accent-text",
}

/** The 2px rule along the top of a stat tile. */
const RULE: Record<Tone, string> = {
  default: "bg-primary/70",
  info: "bg-primary",
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-destructive",
  accent: "bg-brand-accent",
}

/** Tinted square behind an icon. */
const TILE: Record<Tone, string> = {
  default: "border-primary/20 bg-primary/[0.07] text-primary-hover dark:text-primary",
  info: "border-primary/25 bg-primary/10 text-primary-hover dark:text-primary",
  good: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  bad: "border-destructive/25 bg-destructive/10 text-destructive",
  accent: "border-brand-accent/25 bg-brand-accent/10 text-brand-accent-text",
}

/** An icon in a tinted square, the console's marker for a figure or a block. */
export function IconTile({ icon: Icon, tone = "default", size = "md", className }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border",
        size === "sm" ? "h-7 w-7" : size === "md" ? "h-8 w-8" : "h-11 w-11",
        TILE[tone],
        className
      )}
    >
      <Icon className={size === "lg" ? "h-5 w-5" : size === "md" ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.75} />
    </span>
  )
}

export function AdminPageHeader({ title, subtitle, icon: Icon, children }: { title: string; subtitle?: string; icon?: LucideIcon; children?: React.ReactNode }) {
  return (
    <AdminReveal className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3.5">
        {/* The one solid block of brand colour on the page: it anchors the title. */}
        {Icon && (
          <span aria-hidden className="mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center bg-primary text-primary-foreground sm:inline-flex">
            <Icon className="h-5 w-5" strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-[1.875rem]">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-[0.9375rem]">{subtitle}</p>}
        </div>
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </AdminReveal>
  )
}

/**
 * One figure with its label, and an optional line of context under it. `icon`
 * adds its marker, `meter` (0 to 1) a segmented meter under the figure for a
 * rate, and `href` makes the whole tile a link to the page that explains it.
 */
export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  href,
  icon,
  meter,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  tone?: Tone
  href?: string
  icon?: LucideIcon
  meter?: number | null
}) {
  const body = (
    <>
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5", RULE[tone])} />
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium leading-snug text-muted-foreground sm:text-[0.8125rem]">{label}</p>
        {icon && <IconTile icon={icon} tone={tone} size="sm" className="-mt-0.5" />}
      </div>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-[1.75rem]", TONE[tone])}>{value}</div>
      {meter !== undefined && <SegmentMeter value={meter} tone={tone === "default" ? "info" : tone} label={label} className="mt-3" />}
      {(hint || href) && (
        <p className="mt-2 flex items-start justify-between gap-2 text-xs leading-snug text-muted-foreground">
          <span className="min-w-0">{hint}</span>
          {href && <ArrowUpRight aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-50 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary group-hover:opacity-100" />}
        </p>
      )}
    </>
  )
  const frame = "group relative block min-w-0 overflow-hidden border border-border bg-card p-4 sm:p-5"
  return href ? (
    <Link href={href} className={cn(frame, "transition-colors hover:border-primary/40 hover:bg-primary/[0.02] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary")}>
      {body}
    </Link>
  ) : (
    <div className={frame}>{body}</div>
  )
}

export function StatGrid({ children, index = 1, className }: { children: React.ReactNode; index?: number; className?: string }) {
  return (
    <AdminReveal index={index} className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {children}
    </AdminReveal>
  )
}

/**
 * A titled block of the page. `flush` drops the body padding, for lists and
 * tables; `icon` adds the title's marker and `badge` a count or state beside
 * the title (a Chip, usually).
 */
export function Panel({
  title,
  hint,
  action,
  icon,
  iconTone = "default",
  badge,
  index = 2,
  flush = false,
  className,
  children,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
  icon?: LucideIcon
  iconTone?: Tone
  badge?: React.ReactNode
  index?: number
  flush?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <AdminReveal index={index} className={cn("flex min-w-0 flex-col border border-border bg-card", className)}>
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon && <IconTile icon={icon} tone={iconTone} />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="font-semibold leading-8 tracking-tight">{title}</h2>
              {badge}
            </div>
            {hint && <p className="text-sm leading-snug text-muted-foreground">{hint}</p>}
          </div>
        </div>
        {/* Its own size, not stretched across the header when it stacks on a phone. */}
        {action && <div className="shrink-0 self-start sm:pt-1">{action}</div>}
      </div>
      <div className={cn("flex-1", flush ? "" : "p-4 sm:p-5")}>{children}</div>
    </AdminReveal>
  )
}

/** A table that scrolls inside its panel on a phone instead of widening the page. */
export function ScrollTable({ children, minWidth = "36rem" }: { children: React.ReactNode; minWidth?: string }) {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-muted/35 [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_th]:bg-muted/40 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground sm:[&_td:first-child]:pl-5 sm:[&_th:first-child]:pl-5"
        style={{ minWidth }}
      >
        {children}
      </table>
    </div>
  )
}

/**
 * What a block shows when it has nothing to list. With an `icon` (and
 * optionally a `title` and an `action`) it is the full empty state, a dashed
 * frame with the next step in it; without, a quiet line.
 */
export function Empty({ children, icon, title, action }: { children: React.ReactNode; icon?: LucideIcon; title?: string; action?: React.ReactNode }) {
  if (!icon) return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>
  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-col items-center border border-dashed border-border bg-muted/20 px-5 py-9 text-center">
        <IconTile icon={icon} size="lg" />
        {title && <p className="mt-4 font-semibold tracking-tight">{title}</p>}
        <p className={cn("max-w-sm text-sm leading-relaxed text-muted-foreground", title ? "mt-1" : "mt-3")}>{children}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  )
}

const BANNER: Record<Tone, string> = {
  default: "border-border border-l-primary bg-card",
  info: "border-primary/25 border-l-primary bg-primary/[0.05]",
  good: "border-emerald-500/30 border-l-emerald-500 bg-emerald-500/[0.06]",
  warn: "border-amber-500/35 border-l-amber-500 bg-amber-500/[0.07]",
  bad: "border-destructive/30 border-l-destructive bg-destructive/[0.05]",
  accent: "border-brand-accent/25 border-l-brand-accent bg-brand-accent/[0.05]",
}

const BANNER_ICON: Record<Tone, LucideIcon> = { default: Info, info: Info, good: CheckCircle2, warn: CircleAlert, bad: OctagonAlert, accent: Info }

/**
 * A one-line state of the page above its content: the agent's last run,
 * whether every system check passed, a data source that is not connected.
 * The left rule and icon carry the tone; `action` sits at the end (a link).
 */
export function StatusBanner({
  tone = "info",
  icon,
  title,
  children,
  action,
  index = 1,
}: {
  tone?: Tone
  icon?: LucideIcon
  title?: React.ReactNode
  children?: React.ReactNode
  action?: React.ReactNode
  index?: number
}) {
  const Icon = icon ?? BANNER_ICON[tone]
  return (
    <AdminReveal index={index} className={cn("flex flex-col gap-3 border border-l-[3px] px-4 py-3 text-sm sm:flex-row sm:items-center", BANNER[tone])}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon aria-hidden className={cn("mt-0.5 h-4 w-4 shrink-0", TONE[tone === "default" ? "info" : tone])} />
        <div className="min-w-0 flex-1">
          {title && <p className="break-words font-medium text-foreground">{title}</p>}
          {children && <div className={cn("break-words leading-relaxed text-muted-foreground", title && "mt-0.5")}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-7 sm:pl-0">{action}</div>}
    </AdminReveal>
  )
}

/** The text link that ends a banner or a panel header ("Open moderation"). */
export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary-hover underline-offset-4 hover:underline dark:text-primary">
      {children}
      <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
    </Link>
  )
}

const NODE: Record<Tone, string> = {
  default: "border-border bg-muted",
  info: "border-primary bg-primary",
  good: "border-emerald-500 bg-emerald-500",
  warn: "border-amber-500 bg-amber-500",
  bad: "border-destructive bg-destructive",
  accent: "border-brand-accent bg-brand-accent",
}

/**
 * Events newest first on a vertical rule, each with a square node in its
 * status colour: the SEO agent's run log, payment events. Each item's
 * content is the caller's.
 */
export function Timeline({ items }: { items: { key: string; tone: Tone; content: React.ReactNode }[] }) {
  return (
    <ol className="relative px-4 py-2 sm:px-5">
      <span aria-hidden className="absolute bottom-6 left-[calc(1rem+4.5px)] top-6 w-px bg-border sm:left-[calc(1.25rem+4.5px)]" />
      {items.map((item) => (
        <li key={item.key} className="relative grid min-w-0 grid-cols-[10px_minmax(0,1fr)] gap-x-3.5 py-3">
          <span aria-hidden className={cn("relative mt-[5px] h-2.5 w-2.5 border ring-4 ring-card", NODE[item.tone])} />
          <div className="min-w-0">{item.content}</div>
        </li>
      ))}
    </ol>
  )
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
    <nav aria-label={label} className="flex w-max border border-border bg-card p-0.5">
      {windows.map((days) => (
        <Link
          key={days}
          href={`${path}?days=${days}`}
          aria-current={days === current ? "page" : undefined}
          className={cn(
            "px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
            days === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {format(days)}
        </Link>
      ))}
    </nav>
  )
}

/** A short status chip with a square dot in its colour: good, warn, bad, info, accent or neutral. */
export function Chip({ tone = "default", children }: { tone?: Tone; children: React.ReactNode }) {
  const tones: Record<Tone, string> = {
    default: "border-border bg-muted/50 text-muted-foreground",
    info: "border-primary/30 bg-primary/10 text-primary-hover dark:text-primary",
    good: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
    bad: "border-destructive/35 bg-destructive/10 text-destructive",
    accent: "border-brand-accent/30 bg-brand-accent/10 text-brand-accent-text",
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap border px-1.5 py-0.5 text-xs font-medium", tones[tone])}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 bg-current" />
      {children}
    </span>
  )
}
