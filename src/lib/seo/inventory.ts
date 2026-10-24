/**
 * The SEO inventory: one row per indexable page, with the keyword it targets,
 * the search intent behind it, its page type and its status. Shown at
 * /admin/seo/inventory and downloadable from there as CSV.
 *
 * Generated, never typed: the rows are the sitemap's own URLs (src/app/
 * sitemap.ts), joined with the data each page is rendered from, the registry
 * (src/lib/seo/pages.ts), the template library (src/lib/templates.ts) and
 * its taxonomy, the blog and the docs. A page added to any of those appears
 * here on the next deploy with no edit to this file, and the inventory cannot
 * drift from what the site serves.
 *
 * It also reports what a hand-kept list would hide:
 *  - "unlisted": a published registry page or template that the sitemap
 *    leaves out, so search engines are never told about it;
 *  - "draft": a registry page held back on purpose;
 *  - keyword conflicts: two URLs targeting the same phrase, which split each
 *    other's ranking (a registry alias counts, since aliases name intents a
 *    page already owns).
 *
 * Pure, so it is tested without a server (inventory.test.ts).
 */

export const INVENTORY_TYPES = [
  "feature",
  "tool",
  "comparison",
  "alternative",
  "industry",
  "team",
  "use-case",
  "integration",
  "template",
  "category",
  "hub",
  "blog",
  "blog-category",
  "docs",
  "core",
] as const
export type InventoryType = (typeof INVENTORY_TYPES)[number]

export type SearchIntent = "transactional" | "commercial" | "informational" | "navigational"

/**
 * The intent each type of page is written for: a tool or template is used
 * on the spot, a comparison or feature page is weighed before buying, the
 * blog and docs answer a question, and the rest are found by name.
 */
export const INTENT_BY_TYPE: Record<InventoryType, SearchIntent> = {
  feature: "commercial",
  tool: "transactional",
  comparison: "commercial",
  alternative: "commercial",
  industry: "commercial",
  team: "commercial",
  "use-case": "commercial",
  integration: "commercial",
  template: "transactional",
  category: "transactional",
  hub: "navigational",
  blog: "informational",
  "blog-category": "informational",
  docs: "informational",
  core: "navigational",
}

export type InventoryStatus = "live" | "draft" | "unlisted"

export type InventoryRow = {
  path: string
  locale: string
  type: InventoryType
  title: string | null
  keyword: string | null
  /** Other phrases this page owns (registry aliases). */
  aliases: string[]
  intent: SearchIntent
  status: InventoryStatus
  updated: string | null
}

/** A registry page, as much of it as the inventory reads. */
export type RegistryInput = {
  kind: "solution" | "tool" | "comparison" | "alternative" | "use-case" | "integration"
  path: string
  title: string
  primaryKeyword: string
  aliases: string[]
  updated: string
  draft: boolean
}

export type InventoryInput = {
  /** Every URL the sitemap submits, as a path (locale prefix included). */
  sitemapPaths: string[]
  /** Registry pages in the default locale, drafts included. */
  registry: RegistryInput[]
  templates: { path: string; title: string; keyword: string; updated: string }[]
  /** Template category pages that exist, with the phrase their H1 targets. */
  categories: { path: string; title: string; keyword: string; updated?: string | null }[]
  /** Use-case pages that serve an industry or a team (templates-taxonomy.ts). */
  industryPaths: string[]
  teamPaths: string[]
  /** Listing pages: /tools, /compare, /esignature-for, /templates, /blog, /docs. */
  hubPaths: string[]
  posts: { path: string; title: string; updated: string | null; keyword?: string | null }[]
  blogCategories: { path: string; title: string }[]
  docs: { path: string; title: string }[]
  /** Non-default locales, as the first path segment of a translated URL. */
  locales: string[]
  defaultLocale: string
}

/** Splits a translated URL into its locale and the path of the page itself. */
function splitLocale(path: string, locales: string[], defaultLocale: string): { locale: string; base: string } {
  const first = path.split("/")[1]
  if (first && first !== defaultLocale && locales.includes(first)) {
    return { locale: first, base: path.slice(first.length + 1) || "/" }
  }
  return { locale: defaultLocale, base: path }
}

const REGISTRY_TYPE: Record<Exclude<RegistryInput["kind"], "use-case">, InventoryType> = {
  solution: "feature",
  tool: "tool",
  comparison: "comparison",
  alternative: "alternative",
  integration: "integration",
}

export function buildInventory(input: InventoryInput): { rows: InventoryRow[]; conflicts: { keyword: string; paths: string[] }[] } {
  const industries = new Set(input.industryPaths)
  const teams = new Set(input.teamPaths)
  const hubs = new Set(input.hubPaths)

  // What is known about each page, by its untranslated path.
  type Known = Omit<InventoryRow, "path" | "locale" | "status" | "intent"> & { draft?: boolean }
  const known = new Map<string, Known>()
  for (const p of input.registry) {
    const type: InventoryType =
      p.kind === "use-case" ? (industries.has(p.path) ? "industry" : teams.has(p.path) ? "team" : "use-case") : REGISTRY_TYPE[p.kind]
    known.set(p.path, { type, title: p.title, keyword: p.primaryKeyword, aliases: p.aliases, updated: p.updated, draft: p.draft })
  }
  for (const t of input.templates) known.set(t.path, { type: "template", title: t.title, keyword: t.keyword, aliases: [], updated: t.updated })
  for (const c of input.categories) known.set(c.path, { type: "category", title: c.title, keyword: c.keyword, aliases: [], updated: c.updated ?? null })
  for (const p of input.posts) known.set(p.path, { type: "blog", title: p.title, keyword: p.keyword ?? null, aliases: [], updated: p.updated })
  for (const c of input.blogCategories) known.set(c.path, { type: "blog-category", title: c.title, keyword: null, aliases: [], updated: null })
  for (const d of input.docs) known.set(d.path, { type: "docs", title: d.title, keyword: null, aliases: [], updated: null })

  const row = (path: string, locale: string, base: string, status: InventoryStatus): InventoryRow => {
    const k = known.get(base)
    const type: InventoryType = k?.type ?? (hubs.has(base) ? "hub" : "core")
    return {
      path,
      locale,
      type,
      title: k?.title ?? null,
      keyword: k?.keyword ?? null,
      aliases: k?.aliases ?? [],
      intent: INTENT_BY_TYPE[type],
      status,
      updated: k?.updated ?? null,
    }
  }

  const listed = new Set<string>()
  const rows: InventoryRow[] = []
  for (const path of [...new Set(input.sitemapPaths)]) {
    const { locale, base } = splitLocale(path, input.locales, input.defaultLocale)
    if (locale === input.defaultLocale) listed.add(base)
    rows.push(row(path, locale, base, "live"))
  }
  // Published pages the sitemap forgot, and drafts held back on purpose.
  for (const [path, k] of known) {
    if (listed.has(path) || !["feature", "tool", "comparison", "alternative", "industry", "team", "use-case", "integration", "template", "category"].includes(k.type)) continue
    rows.push(row(path, input.defaultLocale, path, k.draft ? "draft" : "unlisted"))
  }

  // Keyword conflicts among live English pages: a primary keyword, alias or
  // template keyword claimed by two URLs.
  const owners = new Map<string, Set<string>>()
  for (const r of rows) {
    if (r.status !== "live" || r.locale !== input.defaultLocale) continue
    for (const phrase of [r.keyword, ...r.aliases]) {
      if (!phrase) continue
      const key = phrase.trim().toLowerCase()
      owners.set(key, (owners.get(key) ?? new Set()).add(r.path))
    }
  }
  const conflicts = [...owners]
    .filter(([, paths]) => paths.size > 1)
    .map(([keyword, paths]) => ({ keyword, paths: [...paths].sort() }))
    .sort((a, b) => a.keyword.localeCompare(b.keyword))

  const order = (t: InventoryType) => INVENTORY_TYPES.indexOf(t)
  rows.sort((a, b) => order(a.type) - order(b.type) || a.path.localeCompare(b.path))
  return { rows, conflicts }
}

/** Rows of one type (or all), matching a search over URL, title, keyword and aliases. */
export function filterInventory(rows: InventoryRow[], type: InventoryType | "all", query: string): InventoryRow[] {
  const q = query.trim().toLowerCase()
  return rows
    .filter((r) => type === "all" || r.type === type)
    .filter((r) => !q || [r.path, r.title, r.keyword, ...r.aliases].some((v) => v?.toLowerCase().includes(q)))
}

/** How many rows of each type, in display order, leaving out types with none. */
export function countByType(rows: InventoryRow[]): { type: InventoryType; count: number }[] {
  return INVENTORY_TYPES.map((type) => ({ type, count: rows.filter((r) => r.type === type).length })).filter((c) => c.count > 0)
}

/** A CSV cell: quoted when it holds a comma, quote or line break. */
function cell(value: string | null): string {
  const v = value ?? ""
  return /[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v
}

/** The inventory as CSV, one row per page, for a spreadsheet. */
export function inventoryCsv(rows: InventoryRow[], origin: string): string {
  const header = ["url", "type", "keyword", "intent", "status", "title", "aliases", "locale", "updated"]
  const lines = rows.map((r) =>
    [`${origin}${r.path}`, r.type, r.keyword, r.intent, r.status, r.title, r.aliases.join("; "), r.locale, r.updated].map(cell).join(",")
  )
  return [header.join(","), ...lines].join("\n")
}
