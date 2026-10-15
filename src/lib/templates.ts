/**
 * The free document templates (/templates): NDAs, employment, freelance,
 * lease and invoice documents, one Markdown file each under
 * content/templates/<slug>.md, and the rules that keep them worth publishing.
 *
 * Why templates: "free NDA template" and its neighbours are searched by the
 * same people who then need the document signed. Each page gives the whole
 * document away (read it, copy it, download it as a PDF) and offers to get it
 * signed; nothing is gated behind a signup.
 *
 * A separate registry from src/lib/seo/pages.ts on purpose. Those pages are
 * articles held to word counts and similarity limits between each other; a
 * template is a document, and two leases rightly share clauses. What a
 * template must have instead (`validateTemplates`, tested beside this file):
 * a unique slug, title, description, H1 and keyword; enough of a document to
 * be useful; blanks to fill in, written as [Like this]; and questions answered
 * on the page.
 *
 * Write `{site}` for the product name, as in the other registries. The body is
 * rendered as MDX, so it must not contain `{`, `}` or `<`: placeholders use
 * square brackets.
 */
import fs from "node:fs"
import path from "node:path"
import matter from "gray-matter"
import { z } from "zod"
import { fillSite } from "@/lib/seo/pages"

export const TEMPLATE_CATEGORIES = ["nda", "employment", "freelance", "lease", "invoice"] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

const isoDate = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a yyyy-mm-dd date")
)

export const templateSchema = z.object({
  title: z.string().min(10).max(60),
  description: z.string().min(70).max(160),
  h1: z.string().min(5).max(70),
  lede: z.string().min(40).max(320),
  category: z.enum(TEMPLATE_CATEGORIES),
  keyword: z.string().min(3),
  /** Who signs it, in the order they usually do: shown beside the signing call to action. */
  signers: z.array(z.string().min(2)).min(1),
  published: isoDate,
  updated: isoDate,
  faq: z.array(z.object({ q: z.string().min(10), a: z.string().min(30) })).default([]),
})

export type Template = z.infer<typeof templateSchema> & {
  slug: string
  path: string
  /** The document in Markdown, with `{site}` filled in. */
  body: string
}

export const TEMPLATES_PATH = "/templates"
export const templatePath = (slug: string) => `${TEMPLATES_PATH}/${slug}`
/** The PDF download, served by src/app/api/templates/[slug]/pdf/route.ts. */
export const templatePdfPath = (slug: string) => `/api/templates/${slug}/pdf`

const DIR = path.join(process.cwd(), "content", "templates")
const SLUG = /^([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/

let cache: Template[] | null = null

/** Every template, sorted by category then title. Read once per process in production. */
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
      return { ...fillSite(result.data), slug: match[1], path: templatePath(match[1]), body: fillSite(content.trim()) }
    })
    .sort((a, b) =>
      a.category === b.category
        ? a.title.localeCompare(b.title)
        : TEMPLATE_CATEGORIES.indexOf(a.category) - TEMPLATE_CATEGORIES.indexOf(b.category)
    )
  cache = templates
  return templates
}

export function getTemplate(slug: string): Template | undefined {
  return getTemplates().find((t) => t.slug === slug)
}

/** Other templates in the same category first, then the rest, up to `limit`. */
export function relatedTemplates(template: Template, all: Template[], limit = 4): Template[] {
  const others = all.filter((t) => t.slug !== template.slug)
  return [...others.filter((t) => t.category === template.category), ...others.filter((t) => t.category !== template.category)].slice(0, limit)
}

/**
 * The document as plain text, for the copy button and the PDF: headings and
 * paragraphs kept, Markdown emphasis removed, bullets as "•", table rows as
 * cells separated by " | " (the divider row dropped). Blank lines separate
 * blocks.
 */
export function templatePlainText(markdown: string): string {
  return markdown
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

/** The blanks a reader fills in: every distinct [Bracketed phrase]. */
export function templatePlaceholders(markdown: string): string[] {
  return [...new Set(markdown.match(/\[[A-Z][^\]\n]{1,60}\]/g) ?? [])]
}

/**
 * Words a template must carry. Invoices and quotes are forms (headers, line
 * items, totals) and rightly shorter than an agreement; padding them to an
 * agreement's length would make them worse documents.
 */
export const MIN_TEMPLATE_WORDS: Record<TemplateCategory, number> = { nda: 250, employment: 250, freelance: 250, lease: 250, invoice: 200 }
export const MIN_TEMPLATE_FAQS = 2

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
    const words = templateWordCount(t.body)
    if (words < MIN_TEMPLATE_WORDS[t.category]) problems.push(`${t.path}: ${words} words of document, needs ${MIN_TEMPLATE_WORDS[t.category]}`)
    if (templatePlaceholders(t.body).length < 3) problems.push(`${t.path}: fewer than 3 [Placeholders] to fill in`)
    if (t.faq.length < MIN_TEMPLATE_FAQS) problems.push(`${t.path}: ${t.faq.length} FAQs, needs ${MIN_TEMPLATE_FAQS}`)
    if (/[{}<]/.test(t.body)) problems.push(`${t.path}: the body contains {, } or <, which MDX would read as code`)
    if (t.updated < t.published) problems.push(`${t.path}: updated is before published`)
    const firstWord = t.keyword.split(/\s+/)[0]
    if (!new RegExp(`\\b${firstWord}`, "i").test(`${t.title} ${t.h1}`)) problems.push(`${t.path}: neither the title nor the H1 mentions "${t.keyword}"`)
  }
  for (const category of TEMPLATE_CATEGORIES) {
    if (!templates.some((t) => t.category === category)) problems.push(`no template in category "${category}"`)
  }
  return problems
}
