"use client"

/**
 * The Help Center's search box: filters every guide by its title,
 * description and topic as you type, with no request to the server.
 *
 * The guides (a few dozen short records) arrive as props from the server
 * page; matching is every typed word appearing somewhere in a guide, so word
 * order and partial words both work ("pay connect" finds "Connect Stripe or
 * Paystack to get paid"). With nothing typed, nothing is shown here and the
 * topic grid below does the browsing. Results animate in and out with
 * framer-motion, off under prefers-reduced-motion.
 */
import { useId, useMemo, useState } from "react"
import Link from "next/link"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Search, X } from "lucide-react"
import { useTranslations } from "next-intl"
import { matchesQuery } from "@/lib/help-search"

export type SearchItem = { href: string; title: string; description: string; topic: string }

export function HelpSearch({ items }: { items: SearchItem[] }) {
  const t = useTranslations("help.search")
  const reduceMotion = useReducedMotion()
  const id = useId()
  const [query, setQuery] = useState("")
  const results = useMemo(() => items.filter((i) => matchesQuery(query, [i.title, i.description, i.topic])), [items, query])
  const searching = query.trim().length > 0

  return (
    <div className="w-full">
      <label htmlFor={`${id}-q`} className="sr-only">
        {t("label")}
      </label>
      <div className="flex h-14 items-center gap-3 border border-border bg-background px-4 shadow-sm transition-colors focus-within:border-primary">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          id={`${id}-q`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholder")}
          autoComplete="off"
          aria-controls={`${id}-results`}
          className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <button type="button" onClick={() => setQuery("")} className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground" aria-label={t("clear")}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div id={`${id}-results`} aria-live="polite">
        <AnimatePresence initial={false}>
          {searching && (
            <motion.div
              key="results"
              initial={reduceMotion ? false : { opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -4 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="mt-3 border border-border bg-background"
            >
              <p className="border-b border-border px-4 py-2.5 text-sm text-muted-foreground">{t("count", { count: results.length })}</p>
              <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto">
                <AnimatePresence initial={false}>
                  {results.map((r) => (
                    <motion.li
                      key={r.href}
                      layout={!reduceMotion}
                      initial={reduceMotion ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
                      transition={{ duration: 0.15 }}
                    >
                      <Link href={r.href} className="group flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-primary/5">
                        <span className="min-w-0">
                          <span className="block font-medium group-hover:text-primary">{r.title}</span>
                          <span className="mt-0.5 block text-sm text-muted-foreground">{r.topic}</span>
                        </span>
                        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
