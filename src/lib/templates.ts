/**
 * The Salsox template library: one Markdown file per template under
 * content/templates/<slug>.md, the data model they follow, and the rules that
 * keep each one worth publishing and usable in the product.
 *
 * A template is a real document, not a page about one. Its file holds:
 *
 * - the document itself (the Markdown body), with blanks written as
 *   [Variable name] and the signing spots written as field tokens,
 *   [[signature:client]], [[initials:client]], [[date:client]],
 *   [[name:client]] and [[text:client]] (an answer the signer types, on
 *   forms), each naming one of the template's roles;
 * - `roles`: who signs, in order. A role marked `you` is the sender, and is
 *   filled in with their own name and email when they use the template;
 * - `variables`: every blank, with a realistic sample value. The page
 *   previews the template filled with the samples; using it asks for the real
 *   values;
 * - taxonomy (category, type, industries, teams, from templates-taxonomy.ts),
 *   which drives the library's filters and the category, industry and team
 *   pages;
 * - the page around it: title, description, H1, lede, an explainer (`about`)
 *   and FAQs, all original to that template.
 *
 * "Use this template" renders the filled document to a PDF with the field
 * tokens turned into placed signing fields (templates-pdf.ts), and the signing
 * engine creates a draft from it (src/lib/esign/templates.ts) that opens in the
 * ordinary editor. So every field token here becomes a real field a recipient
 * signs, not decoration.
 *
 * `validateTemplates` states the rules and the test beside this file holds
 * every template to them. Write `{site}` for the product name. The body and
 * explainer are rendered as MDX, so they must not contain `{`, `}` or `<`.
 *
 * Replaces the first version of this file (17 free templates in five
 * categories, signers as plain labels, signature lines typed as underscores).
 * Those templates were converted to this model and kept their URLs.
 */
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { z } from "zod"
import { fillSite } from "@/lib/seo/pages"
import { INDUSTRY_IDS, TEAM_IDS, TEMPLATE_CATEGORIES, TEMPLATE_TYPES, type TemplateIndustry, type TemplateTeam } from "@/lib/templates-taxonomy"

// The first version's categories, replaced by templates-taxonomy.ts:
// export const TEMPLATE_CATEGORIES = ["nda", "employment", "freelance", "lease", "invoice"] as const
// export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]
export { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/templates-taxonomy"

const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a yyyy-mm-dd date")
)

export const roleSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/, "a lower-case id"),
  label: z.string().min(2).max(40),
  /** The sender: prefilled with the user's own name and email. */
  you: z.boolean().default(false),
})
export type TemplateRole = z.infer<typeof roleSchema>

export const templateSchema = z.object({
  title: z.string().min(10).max(60),
  description: z.string().min(70).max(160),
  h1: z.string().min(5).max(70),
  lede: z.string().min(40).max(320),
  keyword: z.string().min(3),
  category: z.enum(TEMPLATE_CATEGORIES),
  type: z.enum(TEMPLATE_TYPES),
  industries: z.array(z.enum(INDUSTRY_IDS as [TemplateIndustry, ...TemplateIndustry[]])).min(1),
  teams: z.array(z.enum(TEAM_IDS as [TemplateTeam, ...TemplateTeam[]])).default([]),
  roles: z.array(roleSchema).min(1).max(6),
  /** Every [Blank] in the document, with a realistic sample value, in the order they appear. */
  variables: z.record(z.string().min(2).max(60), z.union([z.string(), z.number()]).transform(String)),
  /** What the document is for and how to use it: original Markdown for the page. */
  about: z.string().min(200),
  published: isoDate,
  updated: isoDate,
  faq: z.array(z.object({ q: z.string().min(10), a: z.string().min(30) })).default([]),
})

export type TemplateData = z.infer<typeof templateSchema>

export const FIELD_KINDS = ["signature", "initials", "date", "name", "text"] as const
export type FieldKind = (typeof FIELD_KINDS)[number]
export type FieldToken = { kind: FieldKind; role: string }

export type Template = TemplateData & {
  slug: string
  path: string
  /** The document in Markdown, with `{site}` filled in. */
  body: string
  /** The signing fields the document asks for, in order. */
  fields: FieldToken[]
}

export const TEMPLATES_PATH = "/templates"
export const templatePath = (slug: string) => `${TEMPLATES_PATH}/${slug}`
/** The PDF download, served by src/app/api/templates/[slug]/pdf/route.ts. */
export const templatePdfPath = (slug: string) => `/api/templates/${slug}/pdf`
/** Where "Use this template" lands in the dashboard. */
export const templateUsePath = (slug: string) => `/dashboard/templates/${slug}`

/** [[kind:role]]: a signing field in the document. */
export const FIELD_TOKEN = /\[\[(signature|initials|date|name|text):([a-z][a-z0-9-]*)\]\]/g
/** [Blank to fill in]: starts with a capital, never followed by "(" (that would be a link). */
const PLACEHOLDER = /\[([A-Z][^\]\n]{1,59})\](?!\()/g

export function fieldTokens(markdown: string): FieldToken[] {
  return [...markdown.matchAll(FIELD_TOKEN)].map((m) => ({ kind: m[1] as FieldKind, role: m[2] }))
}

/** The blanks a reader fills in: every distinct [Bracketed phrase], in order. */
export function templatePlaceholders(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(PLACEHOLDER)].map((m) => `[${m[1]}]`))]
}

/**
 * The document with its blanks replaced. Values are looked up by variable
 * name; a blank with no value becomes `missing(name)` (by default it is left
 * as written, [Like this]).
 */
export function fillVariables(markdown: string, values: Record<string, string>, missing: (name: string) => string = (name) => `[${name}]`): string {
  return markdown.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name]?.trim()
    return value ? value : missing(name)
  })
}

const DIR = path.join(process.cwd(), "content", "templates")
const SLUG = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/

let cache: Template[] | null = null

/** Every template, sorted by category (taxonomy order) then title. Read once per process in production. */
export function getTemplates(): Template[] {
  if (cache && process.env.NODE_ENV === "production") return cache
  if (!fs.existsSync(DIR)) return []
  const templates = fs
    .readdirSync(DIR)
    .map((file) => ({ file, match: SLUG.exec(file) }))
    .filter((e): e is { file: string; match: RegExpExecArray } => e.match !== null)
    .map(({ file, match }) => {
      const { data, content } = matter(fs.readFileSync(path.join(DIR, file), "utf8"))
      const result = templateSchema.safeParse(data)
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        throw new Error(`content/templates/${file}: ${issues}`)
      }
      const body = fillSite(content.trim())
      return { ...fillSite(result.data), slug: match[1], path: templatePath(match[1]), body, fields: fieldTokens(body) }
    })
    .sort((a, b) =>
      a.category === b.category ? a.title.localeCompare(b.title) : TEMPLATE_CATEGORIES.indexOf(a.category) - TEMPLATE_CATEGORIES.indexOf(b.category)
    )
  cache = templates
  return templates
}

export function getTemplate(slug: string): Template | undefined {
  return getTemplates().find((t) => t.slug === slug)
}

/** Templates tagged with an industry, a team or a category. */
export function templatesFor(filter: { industry?: string; team?: string; category?: string }, all = getTemplates()): Template[] {
  return all.filter(
    (t) =>
      (!filter.industry || (t.industries as string[]).includes(filter.industry)) &&
      (!filter.team || (t.teams as string[]).includes(filter.team)) &&
      (!filter.category || t.category === filter.category)
  )
}

/**
 * The templates most like this one: same category counts most, then each
 * shared industry and team. Ties keep library order. Never itself.
 */
export function relatedTemplates(template: Template, all: Template[], limit = 4): Template[] {
  const score = (t: Template) =>
    (t.category === template.category ? 3 : 0) +
    t.industries.filter((i) => template.industries.includes(i)).length +
    t.teams.filter((x) => template.teams.includes(x)).length
  return all
    .filter((t) => t.slug !== template.slug)
    .map((t, index) => ({ t, index, score: score(t) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((e) => e.t)
}

const FIELD_LINE: Record<FieldKind, string> = { signature: "____________________", initials: "______", date: "____________", name: "____________________", text: "________________________________" }

/**
 * The document as plain text, for the copy button: headings and paragraphs
 * kept, Markdown emphasis removed, bullets as "•", table rows as cells
 * separated by " | " (the divider row dropped), and each signing field as a
 * line to sign on. Blank lines separate blocks.
 */
export function templatePlainText(markdown: string): string {
  return markdown
    .replace(FIELD_TOKEN, (_m, kind: FieldKind) => FIELD_LINE[kind])
    .split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line))
    .map((line) => (/^\s*\|.*\|\s*$/.test(line) ? line.trim().slice(1, -1).split("|").map((c) => c.trim()).join("  |  ") : line))
    .map((line) =>
      line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1$2")
        .replace(/\\([[\]_*])/g, "$1")
        .trimEnd()
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** Words of document text. */
export function templateWordCount(markdown: string): number {
  return (templatePlainText(markdown).match(/[A-Za-z0-9']+/g) ?? []).length
}

/**
 * Words a template's document must carry, by type. Invoices, quotes, orders
 * and forms are forms (headers, line items, totals, tick boxes) and rightly
 * shorter than an agreement; padding them would make them worse documents.
 */
export const MIN_TEMPLATE_WORDS: Record<TemplateData["type"], number> = { agreement: 250, proposal: 250, letter: 180, quote: 150, invoice: 150, order: 150, form: 150 }
export const MIN_ABOUT_WORDS = 90
export const MIN_TEMPLATE_FAQS = 3

/** Every rule a set of templates must satisfy, as human-readable problems. */
export function validateTemplates(templates: Template[]): string[] {
  const problems: string[] = []
  for (const field of ["slug", "title", "description", "h1", "keyword"] as const) {
    const seen = new Map<string, string>()
    for (const t of templates) {
      const key = t[field].trim().toLowerCase()
      if (seen.has(key)) problems.push(`${t.path}: same ${field} as ${seen.get(key)}`)
      seen.set(key, t.path)
    }
  }
  for (const t of templates) {
    // Counted on the document as the page previews it, filled with its
    // samples: a proposal's substance is in its variables, not its frame.
    const words = templateWordCount(fillVariables(t.body, t.variables))
    if (words < MIN_TEMPLATE_WORDS[t.type]) problems.push(`${t.path}: ${words} words of document, needs ${MIN_TEMPLATE_WORDS[t.type]}`)
    const aboutWords = (t.about.match(/[A-Za-z0-9']+/g) ?? []).length
    if (aboutWords < MIN_ABOUT_WORDS) problems.push(`${t.path}: ${aboutWords} words of explainer, needs ${MIN_ABOUT_WORDS}`)
    if (t.faq.length < MIN_TEMPLATE_FAQS) problems.push(`${t.path}: ${t.faq.length} FAQs, needs ${MIN_TEMPLATE_FAQS}`)
    if (/[{}<]/.test(t.body) || /[{}<]/.test(t.about)) problems.push(`${t.path}: contains {, } or <, which MDX would read as code`)
    if (t.updated < t.published) problems.push(`${t.path}: updated is before published`)
    const firstWord = t.keyword.split(/\s+/)[0]
    if (!new RegExp(`\\b${firstWord}`, "i").test(`${t.title} ${t.h1}`)) problems.push(`${t.path}: neither the title nor the H1 mentions "${t.keyword}"`)

    // Blanks and variables must match one to one, each with a sample.
    const blanks = templatePlaceholders(t.body).map((p) => p.slice(1, -1))
    const declared = Object.keys(t.variables)
    for (const b of blanks) if (!declared.includes(b)) problems.push(`${t.path}: [${b}] has no sample in variables`)
    for (const v of declared) if (!blanks.includes(v)) problems.push(`${t.path}: variable "${v}" is not used in the document`)
    for (const [v, sample] of Object.entries(t.variables)) {
      if (!sample.trim()) problems.push(`${t.path}: variable "${v}" has an empty sample`)
      if (/[{}<[\]]/.test(sample)) problems.push(`${t.path}: the sample for "${v}" contains a bracket or brace`)
    }

    // Every field names a role, and every role signs.
    const roles = new Set(t.roles.map((r) => r.id))
    if (roles.size !== t.roles.length) problems.push(`${t.path}: duplicate role ids`)
    for (const f of t.fields) if (!roles.has(f.role)) problems.push(`${t.path}: [[${f.kind}:${f.role}]] names no role`)
    for (const r of t.roles) {
      if (!t.fields.some((f) => f.role === r.id && f.kind === "signature")) problems.push(`${t.path}: role "${r.id}" has no signature field`)
    }
    if (t.roles.filter((r) => r.you).length > 1) problems.push(`${t.path}: more than one role is "you"`)
  }
  return problems
}

/** What the library's search and filters need, and nothing else: sent to the browser. */
export type TemplateCard = Pick<Template, "slug" | "path" | "h1" | "lede" | "category" | "type" | "industries" | "teams"> & { preview: string[] }

/** The first lines of the filled-in document, for a card's thumbnail. */
export function templatePreviewLines(template: Template, lines = 9): string[] {
  return templatePlainText(fillVariables(template.body, template.variables))
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, lines)
    .map((l) => (l.length > 90 ? `${l.slice(0, 88)}…` : l))
}

export function templateCards(all = getTemplates()): TemplateCard[] {
  return all.map((t) => ({ slug: t.slug, path: t.path, h1: t.h1, lede: t.lede, category: t.category, type: t.type, industries: t.industries, teams: t.teams, preview: templatePreviewLines(t) }))
}
