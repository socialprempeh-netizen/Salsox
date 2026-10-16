"use client"

/**
 * The IndexNow panel on /admin/seo/inventory: what this site has told search
 * engines, so submission is not a black box.
 *
 * - The key file's address (public by design: it proves the site is ours)
 *   and how many URLs have been accepted in all.
 * - The latest submissions, newest first: when, why (deploy, the daily cron
 *   or by hand), how many URLs, the HTTP status api.indexnow.org answered and
 *   whether that counts as accepted. Each one opens to list its URLs.
 * - A table from `md` up and a card per submission below it, like the other
 *   admin views, so a phone never scrolls sideways.
 *
 * Data comes from src/lib/indexnow-store.ts; `log` is null when the tables
 * are not there yet, and the panel says so instead of failing.
 *
 * Motion: a submission's URL list opens and closes with a short height
 * animation (framer-motion); under prefers-reduced-motion it snaps.
 */
import { useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useFormatter, useTranslations } from "next-intl"
import { ChevronDown, ExternalLink } from "lucide-react"
import type { IndexNowPingRow } from "@/lib/indexnow-store"
import { cn } from "@/lib/utils"

export function IndexNowLog({
  log,
  keyFileUrl,
  disabledReason,
}: {
  log: { pings: IndexNowPingRow[]; acceptedUrls: number } | null
  keyFileUrl: string | null
  disabledReason: string | null
}) {
  const t = useTranslations("admin.indexNow")
  const format = useFormatter()
  const reduceMotion = useReducedMotion()
  const [open, setOpen] = useState<string | null>(null)

  const when = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" })
  const result = (p: IndexNowPingRow) => (
    <span
      className={cn(
        "inline-flex border px-1.5 py-0.5 text-xs font-medium",
        p.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-destructive/40 bg-destructive/10 text-destructive"
      )}
    >
      {p.ok ? t("accepted") : t("refused")}
    </span>
  )
  const toggle = (p: IndexNowPingRow) => (
    <button
      type="button"
      onClick={() => setOpen(open === p.id ? null : p.id)}
      aria-expanded={open === p.id}
      className="inline-flex items-center gap-1 tabular-nums underline-offset-4 hover:underline focus-visible:outline-none focus-visible:underline"
    >
      {t("urls", { count: p.urlCount })}
      <ChevronDown aria-hidden className={cn("h-3.5 w-3.5 transition-transform", open === p.id && "rotate-180")} />
    </button>
  )
  const urlList = (p: IndexNowPingRow) => (
    <AnimatePresence initial={false}>
      {open === p.id && (
        <motion.div
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {p.urls.map((u) => (
              <li key={u} className="break-all">{new URL(u).pathname}</li>
            ))}
            {p.urlCount > p.urls.length && <li>{t("more", { count: p.urlCount - p.urls.length })}</li>}
          </ul>
          {p.error && <p className="mt-2 break-words text-xs text-destructive">{p.error}</p>}
        </motion.div>
      )}
    </AnimatePresence>
  )

  return (
    <section className="space-y-4 border border-border bg-card p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("description")}</p>
      </div>

      <dl className="grid gap-px border border-border bg-border text-sm sm:grid-cols-2">
        <div className="bg-background p-3">
          <dt className="text-xs text-muted-foreground">{t("keyFile")}</dt>
          <dd className="mt-1">
            {keyFileUrl ? (
              <a href={keyFileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all underline-offset-4 hover:underline">
                {keyFileUrl} <ExternalLink aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
              </a>
            ) : (
              <span className="text-muted-foreground">{t("off")}</span>
            )}
          </dd>
        </div>
        <div className="bg-background p-3">
          <dt className="text-xs text-muted-foreground">{t("acceptedUrls")}</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{log ? log.acceptedUrls : "—"}</dd>
        </div>
      </dl>

      {disabledReason && <p className="border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t("disabled", { reason: disabledReason })}</p>}

      {!log ? (
        <p className="text-sm text-muted-foreground">{t("unavailable")}</p>
      ) : log.pings.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="border border-border">
          {/* Phone: one card per submission. */}
          <ul className="divide-y divide-border md:hidden">
            {log.pings.map((p) => (
              <li key={p.id} className="space-y-1.5 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="font-medium">{when(p.createdAt)}</span>
                  <span className="shrink-0">{result(p)}</span>
                </div>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{t(`trigger.${p.trigger}`)}</span>
                  <span>{t("status", { status: p.status || t("noAnswer") })}</span>
                </p>
                {toggle(p)}
                {urlList(p)}
              </li>
            ))}
          </ul>

          {/* Wider screens: a table. */}
          <table className="hidden w-full text-sm md:table">
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t("col.when")}</th>
                <th className="px-4 py-3 font-medium">{t("col.trigger")}</th>
                <th className="px-4 py-3 font-medium">{t("col.urls")}</th>
                <th className="px-4 py-3 font-medium">{t("col.status")}</th>
                <th className="px-4 py-3 font-medium">{t("col.result")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {log.pings.map((p) => (
                <tr key={p.id} className="align-top">
                  <td className="whitespace-nowrap px-4 py-3">{when(p.createdAt)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{t(`trigger.${p.trigger}`)}</td>
                  <td className="px-4 py-3">
                    {toggle(p)}
                    {urlList(p)}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">{p.status || t("noAnswer")}</td>
                  <td className="px-4 py-3">{result(p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
