/**
 * An article the agent writes: the shape Claude must return, the checks it
 * must pass before it is saved, and how it becomes a page (Markdown plus
 * structured data). Pure, so every rule is tested (article.test.ts).
 *
 * Written for answer engines as much as for search: one H1 (the page title,
 * rendered by the blog), a short direct answer first, question-shaped H2s,
 * and an FAQ. The FAQ is stored as data and rendered into the body here, so
 * the questions a reader sees and the FAQPage schema are built from the same
 * value and cannot drift apart.
 *
 * Structured data is templated from the article's own fields: Article (the
 * post), FAQPage (its questions), and SoftwareApplication (the product the
 * article leads to), with no rating or price the page does not show.
 */
import { z } from "zod"

export const ARTICLE_LIMITS = {
  title: { min: 20, max: 70 },
  description: { min: 70, max: 160 },
  minWords: 700,
  faq: { min: 3, max: 6 },
  related: { min: 2, max: 3 },
}

/** What the writer returns. Lengths are enforced by `checkDraft`, not here, so a near miss is reported, not a parse failure. */
export const draftSchema = z.object({
  title: z.string(),
  description: z.string(),
  category: z.string(),
  /** Markdown: no H1, no FAQ section (both are added by the page). */
  body: z.string(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  /** Site paths from the list offered in the prompt. */
  related: z.array(z.string()),
})

export type ArticleDraft = z.infer<typeof draftSchema>

/** One word count for every check: Markdown syntax is not words. */
export function countWords(markdown: string): number {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|-]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length
}

/**
 * What is wrong with a draft, as plain sentences for the run log; empty when
 * it can be saved. `allowedRelated` is the list of paths the prompt offered.
 */
export function checkDraft(draft: ArticleDraft, { categories, allowedRelated }: { categories: string[]; allowedRelated: string[] }): string[] {
  const problems: string[] = []
  const { title, description, faq, related, minWords } = ARTICLE_LIMITS
  if (draft.title.length < title.min || draft.title.length > title.max) problems.push(`title is ${draft.title.length} characters (${title.min}-${title.max})`)
  if (draft.description.length < description.min || draft.description.length > description.max) {
    problems.push(`description is ${draft.description.length} characters (${description.min}-${description.max})`)
  }
  if (categories.length > 0 && !categories.includes(draft.category)) problems.push(`category "${draft.category}" is not an existing one`)
  const words = countWords(draft.body)
  if (words < minWords) problems.push(`body is ${words} words (at least ${minWords})`)
  if (/^#\s/m.test(draft.body)) problems.push("body has an H1; the page renders the title as its only H1")
  if ((draft.body.match(/^##\s/gm) ?? []).length < 3) problems.push("body has fewer than three H2 sections")
  if (/^##\s+(frequently asked questions|faqs?)\b/im.test(draft.body)) problems.push("body has its own FAQ section; the FAQ is rendered from the faq list")
  if (draft.faq.length < faq.min || draft.faq.length > faq.max) problems.push(`faq has ${draft.faq.length} entries (${faq.min}-${faq.max})`)
  if (draft.faq.some((f) => f.q.trim().length < 10 || f.a.trim().length < 30)) problems.push("an faq entry is too short")
  const allowed = new Set(allowedRelated)
  const unknown = draft.related.filter((p) => !allowed.has(p))
  if (unknown.length) problems.push(`related paths not offered: ${unknown.join(", ")}`)
  if (draft.related.length < related.min || draft.related.length > related.max) problems.push(`related has ${draft.related.length} paths (${related.min}-${related.max})`)
  // Links in the body must point somewhere real: on-site paths from the
  // offered list, or nothing. Outside links are allowed (sources).
  const bodyLinks = [...draft.body.matchAll(/\]\((\/[^)\s#]*)/g)].map((m) => m[1].replace(/\/$/, "") || "/")
  const badLinks = bodyLinks.filter((p) => !allowed.has(p))
  if (badLinks.length) problems.push(`body links to unknown site paths: ${[...new Set(badLinks)].join(", ")}`)
  return problems
}

/** A URL slug for a keyword: lower case, hyphens, at most eight words. Suffixed until it is free. */
export function slugFor(keyword: string, taken: Set<string>): string {
  const base =
    keyword
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .trim()
      .split(/[\s-]+/)
      .filter(Boolean)
      .slice(0, 8)
      .join("-") || "article"
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/** The heading the rendered FAQ section carries, also used to detect a duplicate one. */
export const FAQ_HEADING = "Frequently asked questions"

/** The body as the page renders it: the article, then its FAQ as questions and answers. */
export function articleMarkdown(body: string, faq: { q: string; a: string }[]): string {
  if (faq.length === 0) return body.trim()
  const questions = faq.map(({ q, a }) => `### ${q.trim()}\n\n${a.trim()}`).join("\n\n")
  return `${body.trim()}\n\n## ${FAQ_HEADING}\n\n${questions}\n`
}

export type ArticleSchemaInput = {
  siteName: string
  siteUrl: string
  siteDescription: string
  slug: string
  title: string
  description: string
  keyword: string
  faq: { q: string; a: string }[]
  /** ISO timestamps. */
  publishedAt: string
  updatedAt?: string
}

/** Article, FAQPage and SoftwareApplication for one article, as JSON-LD objects. */
export function articleJsonLd(input: ArticleSchemaInput): object[] {
  const url = `${input.siteUrl}/blog/${input.slug}`
  const graphs: object[] = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: input.title,
      description: input.description,
      keywords: input.keyword,
      datePublished: input.publishedAt,
      ...(input.updatedAt && input.updatedAt > input.publishedAt ? { dateModified: input.updatedAt } : {}),
      author: { "@type": "Organization", name: input.siteName, url: input.siteUrl },
      publisher: { "@type": "Organization", name: input.siteName, url: input.siteUrl },
      mainEntityOfPage: url,
      about: { "@type": "SoftwareApplication", name: input.siteName },
    },
  ]
  if (input.faq.length) {
    graphs.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: input.faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
    })
  }
  // The product the article is about. No offers or ratings: prices live on
  // the pricing page's own schema, and there are no reviews to mark up.
  graphs.push({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: input.siteName,
    description: input.siteDescription,
    url: input.siteUrl,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
  })
  return graphs
}
