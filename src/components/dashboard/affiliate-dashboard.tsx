"use client"

/**
 * An affiliate's dashboard (/dashboard/affiliate): the link builder, the last
 * 30 days in four numbers and a chart, and the accounts they brought. Shows
 * what affiliateDashboard (src/lib/affiliates-store.ts) computed and decides
 * nothing.
 *
 * The chart has two series, so it carries a legend; colours come from the
 * theme variables, as in the admin charts, so dark mode reads correctly. The
 * data is repeated as a visually hidden table for screen readers.
 *
 * Phone-first: the tiles go two by two, then four across from `md`; the link
 * builder stacks below `sm`. Square corners. Tiles and list rows enter with
 * framer-motion and the chart draws in; with reduced motion all of it just
 * appears.
 */
import { useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Check, Copy, PauseCircle } from "lucide-react"
import { toast } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { affiliateLink } from "@/lib/affiliates"
import type { DailyCount } from "@/lib/affiliates"

type Props = {
  baseUrl: string
  code: string
  active: boolean
  destinations: string[]
  totals: { clicks: number; visitors: number; signups: number; paying: number; conversionLabel: string }
  allTime: { signups: number; paying: number }
  series: DailyCount[]
  recent: { id: string; name: string; joined: string; paying: boolean }[]
  contactEmail: string
}

export function AffiliateDashboardView(props: Props) {
  const t = useTranslations("dashboard.affiliate")
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const [destination, setDestination] = useState(props.destinations[0] ?? "/")
  const [copied, setCopied] = useState(false)
  const link = affiliateLink(props.code, props.baseUrl, destination)
  const destinationLabels: Record<string, string> = {
    "/": t("destHome"),
    "/pricing": t("destPricing"),
    "/request-signature": t("destRequest"),
    "/templates": t("destTemplates"),
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      toast.success(t("copied"))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  const tiles = [
    { key: "statClicks", value: format.number(props.totals.clicks) },
    { key: "statVisitors", value: format.number(props.totals.visitors) },
    { key: "statSignups", value: format.number(props.totals.signups), note: t("statConversion", { rate: props.totals.conversionLabel }) },
    { key: "statPaying", value: format.number(props.totals.paying) },
  ] as const
  const shortDate = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" })
  const longDate = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })
  const empty = props.series.every((d) => d.clicks === 0 && d.signups === 0)

  return (
    <div className="space-y-6">
      {!props.active && (
        <div role="status" className="flex gap-3 border border-l-4 border-amber-500/40 border-l-amber-500 bg-amber-500/5 p-4 text-sm">
          <PauseCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p>{t("paused", { email: props.contactEmail })}</p>
        </div>
      )}

      <section aria-labelledby="affiliate-link-title" className="border bg-card p-4 sm:p-6">
        <h2 id="affiliate-link-title" className="text-sm font-semibold">{t("linkTitle")}</h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-[12rem_1fr_auto]">
          <select
            aria-label={t("destinationLabel")}
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="h-10 border bg-background px-3 text-sm"
          >
            {props.destinations.map((d) => (
              <option key={d} value={d}>{destinationLabels[d] ?? d}</option>
            ))}
          </select>
          <input readOnly value={link} aria-label={t("linkTitle")} onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 border bg-background px-3 font-mono text-sm" />
          <Button type="button" onClick={copy} className="h-10 rounded-none">
            {copied ? <Check className="mr-2 h-4 w-4" aria-hidden="true" /> : <Copy className="mr-2 h-4 w-4" aria-hidden="true" />}
            {copied ? t("copiedShort") : t("copy")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("linkHelp")}</p>
      </section>

      <dl className="grid grid-cols-2 gap-px border bg-border md:grid-cols-4">
        {tiles.map((tile, i) => (
          <motion.div
            key={tile.key}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: reduceMotion ? 0 : i * 0.05 }}
            className="bg-card p-4"
          >
            <dt className="text-xs text-muted-foreground">{t(tile.key)}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
            {"note" in tile && <dd className="mt-0.5 text-xs text-muted-foreground">{tile.note}</dd>}
          </motion.div>
        ))}
      </dl>

      <section aria-labelledby="affiliate-chart-title" className="border bg-card p-4 sm:p-6">
        <h2 id="affiliate-chart-title" className="text-sm font-semibold">{t("chartTitle", { days: props.series.length })}</h2>
        {empty ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("chartEmpty")}</p>
        ) : (
          <figure className="mt-3">
            <div aria-hidden className="h-56 w-full sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={props.series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} minTickGap={28} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const point = payload[0].payload as DailyCount
                      return (
                        <div className="border border-border bg-card px-3 py-2 shadow-soft">
                          <p className="text-xs text-muted-foreground">{longDate(String(label))}</p>
                          <p className="text-sm tabular-nums text-foreground">{t("tooltipClicks", { count: point.clicks })}</p>
                          <p className="text-sm tabular-nums text-foreground">{t("tooltipSignups", { count: point.signups })}</p>
                        </div>
                      )
                    }}
                  />
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                  <Bar dataKey="clicks" name={t("seriesClicks")} fill="var(--muted-foreground)" fillOpacity={0.35} isAnimationActive={!reduceMotion} animationDuration={600} />
                  <Line type="monotone" dataKey="signups" name={t("seriesSignups")} stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={!reduceMotion} animationDuration={700} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <figcaption className="sr-only">
              <table>
                <thead>
                  <tr>
                    <th>{t("tableDate")}</th>
                    <th>{t("seriesClicks")}</th>
                    <th>{t("seriesSignups")}</th>
                  </tr>
                </thead>
                <tbody>
                  {props.series.map((d) => (
                    <tr key={d.date}>
                      <td>{longDate(d.date)}</td>
                      <td>{d.clicks}</td>
                      <td>{d.signups}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </figcaption>
          </figure>
        )}
      </section>

      <section aria-labelledby="affiliate-list-title" className="border bg-card">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b p-4 sm:px-6">
          <h2 id="affiliate-list-title" className="text-sm font-semibold">{t("listTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("allTime", { signups: props.allTime.signups, paying: props.allTime.paying })}</p>
        </div>
        {props.recent.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground sm:px-6">{t("listEmpty")}</p>
        ) : (
          <ul className="divide-y">
            {props.recent.map((person, i) => (
              <motion.li
                key={person.id}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: reduceMotion ? 0 : Math.min(i, 10) * 0.04 }}
                className="flex items-center justify-between gap-3 p-4 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{person.name || t("unnamed")}</p>
                  <p className="text-xs text-muted-foreground">{t("joinedOn", { date: person.joined })}</p>
                </div>
                <span
                  className={
                    person.paying
                      ? "shrink-0 border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                      : "shrink-0 border px-2 py-0.5 text-xs text-muted-foreground"
                  }
                >
                  {t(person.paying ? "statusPaying" : "statusFree")}
                </span>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{t("payoutNote", { email: props.contactEmail })}</p>
    </div>
  )
}
