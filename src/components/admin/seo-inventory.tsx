"use client"

/**
 * The list behind /admin/seo/inventory: every indexable page with its target
 * keyword, search intent, page type and status. The rows are generated on the
 * server (src/lib/seo/inventory.ts); this component only shows them.
 *
 * - A strip of counts (live, draft, not in the sitemap, keyword conflicts),
 *   with the problems spelled out beneath when there are any.
 * - A type filter with counts and a search over URL, title and keywords; the
 *   rules live in inventory.ts.
 * - "Download CSV" hands over the whole inventory, not just what is filtered,
 *   for a spreadsheet or an outreach plan.
 * - A table from `md` up and a card per page below it, like the other admin
 *   views, so a phone never scrolls sideways.
 *
 * Motion: the active filter's highlight slides between filters, and rows fade
 * in and out as the filter changes (framer-motion). Under
 * prefers-reduced-motion both snap.
 */
import { useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { AlertTriangle, Download, ExternalLink, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { countByType, filterInventory, inventoryCsv, type InventoryRow, type InventoryStatus, type InventoryType } from "@/lib/seo/inventory"
import { cn } from "@/lib/utils"

// Green when search engines are told about it, grey when held back on
// purpose, amber when it should be listed and is not.
const STATUS_TONE: Record<InventoryStatus, string> = {
  live: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  draft: "border-border bg-muted/40 text-muted-foreground",
  unlisted: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
}

export function SeoInventory({
  rows,
  conflicts,
  origin,
}: {
  rows: InventoryRow[]
  conflicts: { keyword: string; paths: string[] }[]
  origin: string
}) {
  const t = useTranslations("admin.seoInventory")
  const reduceMotion = useReducedMotion()
  const [type, setType] = useState<InventoryType | "all">("all")
  const [query, setQuery] = useState("")

  const counts = useMemo(() => countByType(rows), [rows])
  const visible = useMemo(() => filterInventory(rows, type, query), [rows, type, query])
  const unlisted = rows.filter((r) => r.status === "unlisted")
  const stats: { key: string; value: number; warn?: boolean }[] = [
    { key: "live", value: rows.filter((r) => r.status === "live").length },
    { key: "draft", value: rows.filter((r) => r.status === "draft").length },
    { key: "unlisted", value: unlisted.length, warn: unlisted.length > 0 },
    { key: "conflicts", value: conflicts.length, warn: conflicts.length > 0 },
  ]

  const download = () => {
    const blob = new Blob([inventoryCsv(rows, origin)], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "seo-inventory.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const rowMotion = {
    initial: reduceMotion ? false : { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    exit: reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transition: { duration: 0.12 } },
    transition: { duration: 0.18, ease: "easeOut" },
  } as const

  const status = (r: InventoryRow) => (
    <span className={cn("inline-flex border px-1.5 py-0.5 text-xs font-medium", STATUS_TONE[r.status])}>{t(`status.${r.status}`)}</span>
  )
  const keyword = (r: InventoryRow) =>
    r.keyword ? (
      <>
        <span className="text-foreground">{r.keyword}</span>
        {r.aliases.length > 0 && (
          <span className="ml-1.5 text-xs text-muted-foreground" title={r.aliases.join(", ")}>
            {t("aliases", { count: r.aliases.length })}
          </span>
        )}
      </>
    ) : (
      <span className="text-muted-foreground">{t("noKeyword")}</span>
    )
  const link = (r: InventoryRow) => (
    <a
      href={r.path}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-w-0 items-center gap-1 break-all font-medium underline-offset-4 hover:underline"
    >
      {r.path}
      <ExternalLink aria-hidden className="h-3 w-3 shrink-0 text-muted-foreground" />
    </a>
  )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-px border border-border bg-border sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.key} className="bg-card p-3">
            <p className={cn("text-2xl font-bold tabular-nums", s.warn && "text-amber-600 dark:text-amber-400")}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{t(`stats.${s.key}`)}</p>
          </div>
        ))}
      </div>

      {(unlisted.length > 0 || conflicts.length > 0) && (
        <div role="alert" className="space-y-2 border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {unlisted.length > 0 && (
            <p className="flex gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 break-words">{t("unlistedNote", { paths: unlisted.map((r) => r.path).join(", ") })}</span>
            </p>
          )}
          {conflicts.map((c) => (
            <p key={c.keyword} className="flex gap-2">
              <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="min-w-0 break-words">{t("conflictNote", { keyword: c.keyword, paths: c.paths.join(", ") })}</span>
            </p>
          ))}
        </div>
      )}

      {/* Filters scroll inside their own strip on a phone, never the page. */}
      {/* Bleeds to the page gutter: 16px on a phone, 24px from sm (was -mx-6 px-6 at every width, from when the admin page padding was p-6 throughout). */}
      <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:px-0">
        <div role="tablist" aria-label={t("filtersLabel")} className="flex w-max gap-1.5">
          {[{ type: "all" as const, count: rows.length }, ...counts].map((c) => {
            const active = type === c.type
            return (
              <button
                key={c.type}
                role="tab"
                aria-selected={active}
                onClick={() => setType(c.type)}
                className={cn(
                  "relative inline-flex h-9 items-center gap-2 border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25",
                  active ? "border-foreground text-foreground" : "border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="seo-inventory-filter"
                    className="absolute inset-0 -z-10 bg-accent"
                    transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.35 }}
                  />
                )}
                {t(`type.${c.type}`)}
                <span className="tabular-nums text-xs text-muted-foreground">{c.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label={t("searchLabel")}
            placeholder={t("searchPlaceholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" onClick={download}>
          <Download aria-hidden className="h-4 w-4" />
          {t("download")}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {t("showing", { count: visible.length, total: rows.length })}
      </p>

      <div className="border border-border bg-card">
        {visible.length === 0 ? (
          <p className="p-8 text-center text-muted-foreground">{t("noMatches")}</p>
        ) : (
          <>
            {/* Phone: one card per page. */}
            <ul className="divide-y divide-border md:hidden">
              <AnimatePresence initial={false}>
                {visible.map((r) => (
                  <motion.li key={r.path} {...rowMotion} className="space-y-1.5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-sm">{link(r)}</div>
                      <span className="shrink-0">{status(r)}</span>
                    </div>
                    <p className="break-words text-sm">{keyword(r)}</p>
                    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{t(`type.${r.type}`)}</span>
                      <span>{t(`intent.${r.intent}`)}</span>
                      {r.locale !== "en" && <span className="uppercase">{r.locale}</span>}
                    </p>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>

            {/* Wider screens: the spreadsheet view. */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-b border-border text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("col.url")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.keyword")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.intent")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.type")}</th>
                  <th className="px-4 py-3 font-medium">{t("col.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {visible.map((r) => (
                    <motion.tr key={r.path} {...rowMotion} className="align-top transition-colors hover:bg-muted/30">
                      <td className="max-w-[18rem] px-4 py-3">
                        {link(r)}
                        {r.title && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground" title={r.title}>{r.title}</p>}
                      </td>
                      <td className="px-4 py-3">{keyword(r)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{t(`intent.${r.intent}`)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {t(`type.${r.type}`)}
                        {r.locale !== "en" && <span className="ml-1.5 text-xs uppercase">{r.locale}</span>}
                      </td>
                      <td className="px-4 py-3">{status(r)}</td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
