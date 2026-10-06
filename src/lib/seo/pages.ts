/**
 * The public landing, tool, comparison and use-case pages: one registry, read
 * from `content/pages/<folder>/<slug>.md` (the folder decides the kind, see
 * KIND_FOLDERS), and the rules that keep them worth indexing.
 *
 * Why a registry rather than a page component each: these pages are where
 * search traffic lands, and their failure modes are quiet. Two pages chasing
 * the same query split each other's ranking. A page generated from a template
 * with the noun swapped is "thin content" to a search engine. A comparison
 * whose facts went stale misleads the reader. None of that breaks a build on
 * its own, so this file states the rules as code (`validatePages`) and the
 * test beside it holds every page to them:
 *
 * - one page per search intent: unique slug, title, description and primary
 *   keyword; an intent that overlaps another page is listed under that page's
 *   `aliases` and redirected to it (src/lib/seo/redirects.ts), never given a
 *   page of its own;
 * - enough original text to be useful, and no two pages sharing more than a
 *   small fraction of their wording (shingle similarity);
 * - comparisons carry the date their facts were checked and their sources;
 * - every page links onward to at least three others that exist.
 *
 * Scaling up is adding a file, not code: a new use case or alternative page
 * is one Markdown file with this frontmatter, and the test decides whether it
 * is distinct and substantial enough to ship. Write `{site}` for the product
 * name; it is filled in from siteConfig so the pages follow a rebrand.
 *
 * International: a translation is `<slug>.<locale>.md` beside the English
 * file. Only translated pages get a localized URL and hreflang alternates,
 * so the same text is never published under two addresses.
 */
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { z } from "zod"
import { siteConfig } from "@/config/site"
import { routing } from "@/i18n/routing"

export const PAGE_KINDS = ["solution", "tool", "comparison", "alternative", "use-case"] as const
export type PageKind = (typeof PAGE_KINDS)[number]

/** The folder under content/pages that holds each kind. */
export const KIND_FOLDERS: Record<PageKind, string> = {
  solution: "solutions",
  tool: "tools",
  comparison: "compare",
  alternative: "alternatives",
  "use-case": "use-cases",
}

export const TOOL_IDS = ["sign-pdf", "add-signature-to-pdf", "fill-and-sign-pdf", "request-signature", "pdf-signature-generator"] as const
export type ToolId = (typeof TOOL_IDS)[number]

/** Where each kind lives. Solutions and tools sit at the root: short, clean URLs for the queries they answer. */
export function pagePath(kind: PageKind, slug: string): string {
  switch (kind) {
    case "comparison":
      return `/compare/${slug}`
    case "alternative":
      return `/alternatives/${slug}`
    case "use-case":
      return `/esignature-for/${slug}`
    default:
      return `/${slug}`
  }
}

const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a yyyy-mm-dd date")
)
const titled = z.object({ title: z.string().min(3), body: z.string().min(20) })

export const frontmatterSchema = z
  .object({
    // Set from the folder the file is in, not written in the file.
    kind: z.enum(PAGE_KINDS),
    title: z.string().min(10).max(60),
    description: z.string().min(70).max(160),
    h1: z.string().min(5).max(90),
    lede: z.string().min(40).max(320),
    primaryKeyword: z.string().min(3),
    aliases: z.array(z.string().min(3)).default([]),
    published: isoDate,
    updated: isoDate,
    breadcrumb: z.string().min(2).max(40),
    tool: z.enum(TOOL_IDS).optional(),
    competitor: z.object({ name: z.string(), url: z.url() }).optional(),
    checked: isoDate.optional(),
    sources: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
    howItWorks: z.array(titled).default([]),
    benefits: z.array(titled).default([]),
    faq: z.array(z.object({ q: z.string().min(10), a: z.string().min(30) })).default([]),
    related: z.array(z.string().startsWith("/")).default([]),
    draft: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "tool" && !data.tool) ctx.addIssue({ code: "custom", path: ["tool"], message: "a tool page names its tool" })
    if (data.kind === "tool" && data.howItWorks.length < 3) ctx.addIssue({ code: "custom", path: ["howItWorks"], message: "a tool page explains at least three steps" })
    if (data.kind === "comparison" && (!data.checked || data.sources.length === 0 || !data.competitor)) {
      ctx.addIssue({ code: "custom", path: ["sources"], message: "a comparison names its competitor, its sources and the date they were checked" })
    }
    if (data.updated < data.published) ctx.addIssue({ code: "custom", path: ["updated"], message: "updated is before published" })
  })

export type PageFrontmatter = z.infer<typeof frontmatterSchema>

export type SitePage = PageFrontmatter & {
  slug: string
  locale: string
  path: string
  /** The Markdown body, with `{site}` filled in. */
  body: string
  /** Locales this page exists in, English first. */
  locales: string[]
}

const DIR = path.join(process.cwd(), "content", "pages")

/** `{site}` becomes the product name everywhere a page says it. */
export function fillSite<T>(value: T): T {
  if (typeof value === "string") return value.replaceAll("{site}", siteConfig.name) as T
  if (Array.isArray(value)) return value.map(fillSite) as T
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fillSite(v)])) as T
  return value
}

/** Splits `name.it.md` into its slug and locale; English files have no suffix. */
export function parseFileName(file: string): { slug: string; locale: string } | null {
  const match = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.([a-z]{2}))?\.md$/.exec(file)
  if (!match) return null
  return { slug: match[1], locale: match[2] ?? routing.defaultLocale }
}

let cache: SitePage[] | null = null

/** Every page in every locale, drafts included (callers filter). Read once per process. */
export function loadAllPages(): SitePage[] {
  if (cache && process.env.NODE_ENV === "production") return cache
  if (!fs.existsSync(DIR)) return []
  const entries = PAGE_KINDS.flatMap((kind) => {
    const folder = path.join(DIR, KIND_FOLDERS[kind])
    if (!fs.existsSync(folder)) return []
    return fs
      .readdirSync(folder)
      .map((file) => ({ kind, file: `${KIND_FOLDERS[kind]}/${file}`, parsed: parseFileName(file) }))
      .filter((e): e is { kind: PageKind; file: string; parsed: { slug: string; locale: string } } => e.parsed !== null)
  })
  const localesByKey = new Map<string, string[]>()
  const key = (kind: PageKind, slug: string) => `${kind}/${slug}`
  for (const { kind, parsed } of entries) localesByKey.set(key(kind, parsed.slug), [...(localesByKey.get(key(kind, parsed.slug)) ?? []), parsed.locale])

  const pages = entries.map(({ kind, file, parsed }) => {
    const { data, content } = matter(fs.readFileSync(path.join(DIR, file), "utf8"))
    const result = frontmatterSchema.safeParse({ ...data, kind })
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      throw new Error(`content/pages/${file}: ${issues}`)
    }
    const locales = (localesByKey.get(key(kind, parsed.slug)) ?? []).sort((a, b) => (a === routing.defaultLocale ? -1 : b === routing.defaultLocale ? 1 : a.localeCompare(b)))
    return {
      ...fillSite(result.data),
      slug: parsed.slug,
      locale: parsed.locale,
      path: pagePath(result.data.kind, parsed.slug),
      body: fillSite(content.trim()),
      locales,
    }
  })
  cache = pages
  return pages
}

/** Published pages in one locale (English by default). */
export function getPages(options: { kind?: PageKind; locale?: string } = {}): SitePage[] {
  const locale = options.locale ?? routing.defaultLocale
  return loadAllPages().filter((p) => !p.draft && p.locale === locale && (!options.kind || p.kind === options.kind))
}

export function getPage(kind: PageKind, slug: string, locale: string = routing.defaultLocale): SitePage | undefined {
  return getPages({ kind, locale }).find((p) => p.slug === slug)
}

export function getPageByPath(pathname: string): SitePage | undefined {
  return getPages().find((p) => p.path === pathname)
}

// ─── Quality rules ───────────────────────────────────────────────────────────

/** Words of running text, ignoring Markdown syntax, links' targets and code. */
export function wordCount(markdown: string): number {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\]\([^)]*\)/g, "]")
    .replace(/[#>*_`|[\]-]/g, " ")
  return (text.match(/[A-Za-z0-9À-ɏ']+/g) ?? []).length
}

function shingles(text: string, size = 5): Set<string> {
  const words = (text.toLowerCase().match(/[a-z0-9']+/g) ?? [])
  const out = new Set<string>()
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "))
  return out
}

/** Jaccard similarity of two texts' five-word sequences: 0 shares nothing, 1 is a copy. */
export function similarity(a: string, b: string): number {
  const sa = shingles(a)
  const sb = shingles(b)
  if (sa.size === 0 || sb.size === 0) return 0
  let shared = 0
  for (const s of sa) if (sb.has(s)) shared++
  return shared / (sa.size + sb.size - shared)
}

/** Running text a page must carry, by kind. Tools also carry steps, benefits and FAQs. */
export const MIN_WORDS: Record<PageKind, number> = { solution: 450, tool: 300, comparison: 500, alternative: 450, "use-case": 450 }
/** Above this, two pages say too much of the same thing to both deserve a URL. */
export const MAX_SIMILARITY = 0.12

/**
 * Every rule a set of pages must satisfy, as human-readable problems.
 * `knownPaths` are the other routes a page may link to (pricing, blog posts…).
 */
export function validatePages(pages: SitePage[], knownPaths: Set<string>): string[] {
  const problems: string[] = []
  const english = pages.filter((p) => p.locale === routing.defaultLocale && !p.draft)
  const own = new Set(english.map((p) => p.path))
  const seen = (field: "title" | "description" | "h1" | "primaryKeyword") => {
    const by = new Map<string, string>()
    for (const p of english) {
      const key = p[field].trim().toLowerCase()
      if (by.has(key)) problems.push(`${p.path}: same ${field} as ${by.get(key)}`)
      by.set(key, p.path)
    }
  }
  seen("title")
  seen("description")
  seen("h1")
  seen("primaryKeyword")

  // An intent belongs to exactly one page.
  const intents = new Map<string, string>()
  for (const p of english) {
    for (const intent of [p.primaryKeyword, ...p.aliases].map((s) => s.trim().toLowerCase())) {
      const owner = intents.get(intent)
      if (owner && owner !== p.path) problems.push(`${p.path}: intent "${intent}" already belongs to ${owner}`)
      intents.set(intent, p.path)
    }
  }

  for (const p of english) {
    const words = wordCount(p.body)
    if (words < MIN_WORDS[p.kind]) problems.push(`${p.path}: ${words} words of body text, needs ${MIN_WORDS[p.kind]}`)
    if (p.related.length < 3) problems.push(`${p.path}: links to ${p.related.length} related pages, needs 3`)
    for (const target of p.related) {
      if (target === p.path) problems.push(`${p.path}: lists itself as related`)
      else if (!own.has(target) && !knownPaths.has(target)) problems.push(`${p.path}: related link ${target} goes nowhere`)
    }
    if (p.faq.length < (p.kind === "tool" ? 4 : 3)) problems.push(`${p.path}: ${p.faq.length} FAQs, needs ${p.kind === "tool" ? 4 : 3}`)
    if (!new RegExp(`\\b${p.primaryKeyword.split(/\s+/)[0]}`, "i").test(`${p.title} ${p.h1}`)) {
      problems.push(`${p.path}: neither the title nor the H1 mentions "${p.primaryKeyword}"`)
    }
  }

  for (let i = 0; i < english.length; i++) {
    for (let j = i + 1; j < english.length; j++) {
      const score = similarity(english[i].body, english[j].body)
      if (score > MAX_SIMILARITY) problems.push(`${english[i].path} and ${english[j].path} are ${(score * 100).toFixed(0)}% alike`)
    }
  }
  return problems
}
