"use client"

/**
 * The searchable, filterable template library, used on the public /templates
 * page and in the dashboard (/dashboard/templates), where cards lead to the
 * "use this template" form instead of the public page.
 *
 * Search matches a template's name, summary, category, type, industries and
 * teams; four filters narrow by category, industry, team and type. The
 * current search and filters live in the URL (?q=&category=&industry=&team=
 * &type=), written with history.replaceState so a filtered view can be
 * shared without a navigation per keystroke. Canonical URLs stay the bare
 * /templates, so filtered views are never indexed as separate pages.
 *
 * Cards move into place with framer-motion layout animations when the result
 * set changes; with prefers-reduced-motion they snap. The page renders the
 * full, unfiltered grid on the server as this component's Suspense fallback,
 * so crawlers and no-JavaScript readers see every template.
 *
 * Every string arrives translated as props: the public pages send client
 * components as few messages as possible.
 */
import { useDeferredValue, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { Search, X } from "lucide-react"
import type { TemplateCard as Card } from "@/lib/templates"
import { TemplateCard } from "@/components/templates/template-card"

type Facet = "category" | "industry" | "team" | "type"
const FACETS: Facet[] = ["category", "industry", "team", "type"]

export type LibraryLabels = {
  search: string
  searchPlaceholder: string
  facets: Record<Facet, string>
  any: string
  clear: string
  /** "{count}" is replaced with the number of results. */
  resultsOne: string
  resultsOther: string
  empty: string
}

const SELECT =
  "h-11 w-full min-w-0 border border-input bg-card px-3 text-sm text-foreground transition-colors hover:border-foreground/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"

export function TemplateLibrary({
  cards,
  options,
  labels,
  hrefBase = "/templates",
}: {
  cards: Card[]
  /** Each facet's choices, as id → label, in display order. */
  options: Record<Facet, Record<string, string>>
  labels: LibraryLabels
  hrefBase?: string
}) {
  const params = useSearchParams()
  const reduceMotion = useReducedMotion()
  const [query, setQuery] = useState(() => params.get("q") ?? "")
  const [filters, setFilters] = useState<Record<Facet, string>>(() => ({
    category: params.get("category") ?? "",
    industry: params.get("industry") ?? "",
    team: params.get("team") ?? "",
    type: params.get("type") ?? "",
  }))
  const deferredQuery = useDeferredValue(query)

  const sync = (nextQuery: string, nextFilters: Record<Facet, string>) => {
    const search = new URLSearchParams()
    if (nextQuery.trim()) search.set("q", nextQuery.trim())
    for (const f of FACETS) if (nextFilters[f]) search.set(f, nextFilters[f])
    const qs = search.toString()
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname)
  }

  const visible = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return cards.filter((c) => {
      if (filters.category && c.category !== filters.category) return false
      if (filters.type && c.type !== filters.type) return false
      if (filters.industry && !c.industries.includes(filters.industry as never)) return false
      if (filters.team && !c.teams.includes(filters.team as never)) return false
      if (!q) return true
      const haystack = [c.h1, c.lede, options.category[c.category], options.type[c.type], ...c.industries.map((i) => options.industry[i]), ...c.teams.map((x) => options.team[x])]
        .join(" ")
        .toLowerCase()
      // Each typed word must start a word in the haystack: "nda" finds
      // "NDA", not "standard".
      const words = haystack.split(/[^a-z0-9]+/)
      // Typed words are split the same way, so "one-way" finds "One-way".
      return q.split(/[^a-z0-9]+/).filter(Boolean).every((typed) => words.some((w) => w.startsWith(typed)))
    })
  }, [cards, filters, deferredQuery, options])

  const active = query.trim() !== "" || FACETS.some((f) => filters[f])

  return (
    <div>
      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">{labels.search}</span>
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              sync(e.target.value, filters)
            }}
            placeholder={labels.searchPlaceholder}
            className="h-12 w-full border border-input bg-card pl-10 pr-3 text-base text-foreground placeholder:text-muted-foreground transition-colors hover:border-foreground/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25"
          />
        </label>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {FACETS.map((facet) => (
            <label key={facet} className="block min-w-0">
              <span className="sr-only">{labels.facets[facet]}</span>
              <select
                value={filters[facet]}
                onChange={(e) => {
                  const next = { ...filters, [facet]: e.target.value }
                  setFilters(next)
                  sync(query, next)
                }}
                className={SELECT}
              >
                <option value="">
                  {labels.facets[facet]}: {labels.any}
                </option>
                {Object.entries(options[facet]).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 text-sm">
          <p aria-live="polite" className="text-muted-foreground">
            {(visible.length === 1 ? labels.resultsOne : labels.resultsOther).replace("{count}", String(visible.length))}
          </p>
          {active && (
            <button
              type="button"
              onClick={() => {
                const cleared = { category: "", industry: "", team: "", type: "" }
                setQuery("")
                setFilters(cleared)
                sync("", cleared)
              }}
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" /> {labels.clear}
            </button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 border border-dashed border-border p-8 text-center text-muted-foreground">{labels.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.map((card) => (
              <motion.li
                key={card.slug}
                layout={!reduceMotion}
                initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="min-w-0"
              >
                <TemplateCard card={card} categoryLabel={options.category[card.category] ?? card.category} hrefBase={hrefBase} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
