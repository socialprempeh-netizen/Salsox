"use client"

/**
 * Visitors per day, from Google Analytics, on /admin/analytics/traffic.
 *
 * One series, so one line in the theme's primary and no legend: the panel's
 * title names it. A crosshair tooltip gives each day's visitors and sessions
 * in text colours, never the line's. Colours come from the theme variables,
 * as in revenue-chart.tsx, so dark mode reads correctly. The line draws in
 * on first render; with prefers-reduced-motion it appears at once. The data
 * is also given as a visually hidden table for screen readers.
 */
import { useFormatter } from "next-intl"
import { useReducedMotion } from "framer-motion"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import type { DailyPoint } from "@/lib/admin/traffic"

export function TrafficChart({ data, labels }: { data: DailyPoint[]; labels: { visitors: string; sessions: string; date: string } }) {
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  // GA's dates are calendar days: read them as UTC so no timezone shifts a day.
  const shortDate = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { month: "short", day: "numeric", timeZone: "UTC" })
  const longDate = (iso: string) => format.dateTime(new Date(`${iso}T00:00:00Z`), { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })

  return (
    <figure>
      <div aria-hidden className="h-56 w-full sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} minTickGap={28} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={40} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as DailyPoint
                return (
                  <div className="border border-border bg-card px-3 py-2 shadow-soft">
                    <p className="text-xs text-muted-foreground">{longDate(String(label))}</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {format.number(point.visitors)} <span className="font-normal text-muted-foreground">{labels.visitors}</span>
                    </p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {format.number(point.sessions)} {labels.sessions}
                    </p>
                  </div>
                )
              }}
            />
            <Line
              type="monotone"
              dataKey="visitors"
              stroke="var(--primary)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
              isAnimationActive={!reduceMotion}
              animationDuration={700}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        <table>
          <thead>
            <tr>
              <th>{labels.date}</th>
              <th>{labels.visitors}</th>
              <th>{labels.sessions}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.date}>
                <td>{longDate(d.date)}</td>
                <td>{d.visitors}</td>
                <td>{d.sessions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </figcaption>
    </figure>
  )
}
