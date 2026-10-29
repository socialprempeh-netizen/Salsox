/**
 * The template library and the comparison, alternative and law pages as
 * readers see them: the Markdown files plus the pages the SEO agent wrote
 * and published, which live in the database. The page-mode counterpart of
 * blog-posts.ts.
 *
 * Public surfaces that list or show these pages (the template pages and
 * hubs, the dashboard's templates, the /compare and /esignature-law hubs,
 * the comparison pages, the sitemap) read through here, so a published page
 * appears everywhere a file page does, and its siblings link to it. A file
 * wins over a generated page with the same slug.
 *
 * A generated page that was flagged as a near-duplicate and published by a
 * person anyway is reachable at its URL but noindexed: it is left out of
 * every listing and the sitemap, and `find*` reports `noindex` so the route
 * can say so in its metadata.
 *
 * A stored page that no longer passes its schema (a rule tightened since it
 * was written) is skipped with a log line rather than breaking the page
 * that lists it.
 */
import { getPages, type PageKind, type SitePage } from "@/lib/seo/pages"
import { getTemplates, type Template } from "@/lib/templates"
import { TEMPLATE_CATEGORIES } from "@/lib/templates-taxonomy"
import { toSitePage, toTemplate, type StoredKind } from "./page-draft"
import { siblingRing } from "./quality"
import { publishedPage, publishedPages, type PublishedPageRow } from "./store"

/** The stored kind behind each registry kind the agent writes. */
// "use-case" was added for the page matrix's industry, role and market pages.
const STORED: Partial<Record<PageKind, Exclude<StoredKind, "TEMPLATE">>> = { comparison: "COMPARISON", alternative: "ALTERNATIVE", compliance: "COMPLIANCE", "use-case": "USE_CASE" }

const sortTemplates = (list: Template[]) =>
  list.sort((a, b) => (a.category === b.category ? a.title.localeCompare(b.title) : TEMPLATE_CATEGORIES.indexOf(a.category) - TEMPLATE_CATEGORIES.indexOf(b.category)))

function rowTemplate(row: PublishedPageRow): Template | null {
  const result = toTemplate(row.slug, { data: row.data, body: row.body })
  if ("problems" in result) {
    console.error(`[seo-agent] generated template ${row.slug} no longer validates: ${result.problems.join("; ")}`)
    return null
  }
  return result.template
}

function rowPage(kind: PageKind, row: PublishedPageRow): SitePage | null {
  const result = toSitePage(kind, row.slug, { data: row.data, body: row.body })
  if ("problems" in result) {
    console.error(`[seo-agent] generated ${kind} page ${row.slug} no longer validates: ${result.problems.join("; ")}`)
    return null
  }
  return result.page
}

/** Every template a reader can find: the files and the indexable generated ones, in library order. */
export async function libraryTemplates(): Promise<Template[]> {
  const files = getTemplates()
  const taken = new Set(files.map((t) => t.slug))
  const generated = (await publishedPages(["TEMPLATE"]))
    .filter((r) => !r.noindex && !taken.has(r.slug))
    .map(rowTemplate)
    .filter((t): t is Template => t !== null)
  return generated.length ? sortTemplates([...files, ...generated]) : files
}

export type FoundTemplate = { template: Template; generated: boolean; noindex: boolean }

/** One template by slug, file or generated (noindexed ones included, for their own URL). */
export async function findLibraryTemplate(slug: string): Promise<FoundTemplate | undefined> {
  const file = getTemplates().find((t) => t.slug === slug)
  if (file) return { template: file, generated: false, noindex: false }
  const row = await publishedPage("TEMPLATE", slug)
  const template = row ? rowTemplate(row) : null
  return template && row ? { template, generated: true, noindex: row.noindex } : undefined
}

/** Registry pages of some kinds: the files and the indexable generated pages, kind by kind. */
export async function registryPages(kinds: PageKind[]): Promise<SitePage[]> {
  const stored = kinds.map((k) => STORED[k]).filter((k): k is Exclude<StoredKind, "TEMPLATE"> => Boolean(k))
  const rows = stored.length ? await publishedPages(stored) : []
  return kinds.flatMap((kind) => {
    const files = getPages({ kind })
    const taken = new Set(files.map((p) => p.slug))
    const generated = rows
      .filter((r) => r.kind === STORED[kind] && !r.noindex && !taken.has(r.slug))
      .map((r) => rowPage(kind, r))
      .filter((p): p is SitePage => p !== null)
    return [...files, ...generated]
  })
}

export type FoundPage = { page: SitePage; generated: boolean; noindex: boolean }

export async function findRegistryPage(kind: PageKind, slug: string): Promise<FoundPage | undefined> {
  const file = getPages({ kind }).find((p) => p.slug === slug)
  if (file) return { page: file, generated: false, noindex: false }
  const storedKind = STORED[kind]
  if (!storedKind) return undefined
  const row = await publishedPage(storedKind, slug)
  const page = row ? rowPage(kind, row) : null
  return page && row ? { page, generated: true, noindex: row.noindex } : undefined
}

/** The hub family a registry page links sideways within, if the agent writes pages there. */
export const FAMILIES: Partial<Record<PageKind, PageKind[]>> = {
  comparison: ["comparison", "alternative"],
  alternative: ["comparison", "alternative"],
  compliance: ["compliance"],
  "use-case": ["use-case"],
}

/**
 * The sibling pages a comparison, alternative or law page links to under its
 * own related pages: its neighbours in the hub's order (siblingRing), minus
 * any it already lists. Every page in a family then has incoming links from
 * the pages beside it, including each new one the agent publishes.
 */
export async function siblingLinks(page: SitePage, count = 4): Promise<SitePage[]> {
  const family = FAMILIES[page.kind]
  if (!family) return []
  const all = (await registryPages(family)).sort((a, b) => a.path.localeCompare(b.path))
  const index = all.findIndex((p) => p.path === page.path)
  const listed = new Set(page.related)
  // A comparison links first to the other comparisons that name the same
  // companies (the matrix writes many: "A vs B", "A vs C", "A for real estate"),
  // then to its neighbours in the hub.
  const names = [page.competitor?.name, ...page.rivals.map((r) => r.name)].filter((n): n is string => Boolean(n))
  const sharing = names.length ? all.filter((p) => p.path !== page.path && !listed.has(p.path) && [p.competitor?.name, ...p.rivals.map((r) => r.name)].some((n) => n && names.includes(n))) : []
  const ring = siblingRing(all, index, count + listed.size + sharing.length).filter((p) => !listed.has(p.path))
  return [...new Map([...sharing, ...ring].map((p) => [p.path, p])).values()].slice(0, count)
}

/**
 * Link-card labels for the generated pages, to merge with the fixed ones
 * when resolving a page's related links (src/lib/seo/links.ts knows only the
 * files), so a link to a generated page renders like any other.
 */
export async function generatedLinkLabels(): Promise<Record<string, { name: string; description: string }>> {
  // Was comparison, alternative and compliance; the agent now writes use-case pages too.
  const pages = await registryPages(["comparison", "alternative", "compliance", "use-case"])
  return Object.fromEntries(pages.map((p) => [p.path, { name: p.breadcrumb, description: p.description }]))
}

/** Metadata for a generated page published despite being flagged: reachable, followed, never indexed. */
export function noindexRobots(noindex: boolean): { robots?: { index: false; follow: true } } {
  return noindex ? { robots: { index: false, follow: true } } : {}
}
