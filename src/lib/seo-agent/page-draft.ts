/**
 * The pages the SEO agent writes, as data: the shape Claude must return for
 * each kind, how a draft becomes a stored page, how a stored page becomes
 * the same Template or SitePage the file-based pages are, and the checks a
 * draft must pass. Pure; tested in page-draft.test.ts.
 *
 * A generated page is held to the rules its file-based siblings are held
 * to, by reusing them rather than restating them: a template is parsed with
 * `templateSchema` and checked by `validateTemplates` (src/lib/templates.ts),
 * a comparison, alternative or law page with `frontmatterSchema` and
 * `validatePages` (src/lib/seo/pages.ts). On top of those come the agent's
 * own gates (quality.ts) and, for law pages, a check that every statute and
 * section the page cites is one of the verified facts it was given.
 */
import { z } from "zod"
import { fillSite, frontmatterSchema, pagePath, validatePages, type PageKind, type SitePage } from "@/lib/seo/pages"
import { fieldTokens, templatePath, templateSchema, validateTemplates, type Template } from "@/lib/templates"
import type { ComplianceCandidate, CompetitorCandidate, PageCandidate, PageCandidateKind, Source, TemplateCandidate } from "./page-queue"

// ─── What Claude returns ─────────────────────────────────────────────────────

const qa = z.object({ q: z.string(), a: z.string() })
const titled = z.object({ title: z.string(), body: z.string() })

/** A template: the document plus the page around it. Lists rather than maps, which structured outputs handle more reliably. */
export const templateDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  h1: z.string(),
  /** The page's unique intro: the situation this document is for. */
  lede: z.string(),
  /** Every [Blank] in the document, with a realistic sample. */
  variables: z.array(z.object({ name: z.string(), sample: z.string() })),
  /** Markdown explainer: what the document is for and how to use it. */
  about: z.string(),
  faq: z.array(qa),
  /** The document itself, in Markdown, with [Blanks] and [[kind:role]] signing fields. */
  body: z.string(),
})
export type TemplateDraft = z.infer<typeof templateDraftSchema>

/** A comparison, alternative or law page. */
export const pageDraftSchema = z.object({
  title: z.string(),
  description: z.string(),
  h1: z.string(),
  /** The page's unique intro. */
  lede: z.string(),
  breadcrumb: z.string(),
  aliases: z.array(z.string()),
  benefits: z.array(titled),
  faq: z.array(qa),
  /** Site paths from the list offered. */
  related: z.array(z.string()),
  /** Markdown body: no H1, no FAQ section. */
  body: z.string(),
})
export type PageDraft = z.infer<typeof pageDraftSchema>

export type AnyDraft = TemplateDraft | PageDraft

// ─── Kinds ───────────────────────────────────────────────────────────────────

export type StoredKind = "TEMPLATE" | "COMPARISON" | "ALTERNATIVE" | "COMPLIANCE"

export const STORED_KIND: Record<PageCandidateKind, StoredKind> = { template: "TEMPLATE", comparison: "COMPARISON", alternative: "ALTERNATIVE", compliance: "COMPLIANCE" }
export const CANDIDATE_KIND: Record<StoredKind, PageCandidateKind> = { TEMPLATE: "template", COMPARISON: "comparison", ALTERNATIVE: "alternative", COMPLIANCE: "compliance" }

/** The registry kind a stored page renders as; templates are not registry pages. */
export const REGISTRY_KIND: Record<Exclude<StoredKind, "TEMPLATE">, PageKind> = { COMPARISON: "comparison", ALTERNATIVE: "alternative", COMPLIANCE: "compliance" }

export function storedPath(kind: StoredKind, slug: string): string {
  return kind === "TEMPLATE" ? templatePath(slug) : pagePath(REGISTRY_KIND[kind], slug)
}

// ─── Draft → stored data ─────────────────────────────────────────────────────

/** What the page is stored as: its frontmatter (`data`) and Markdown body, exactly as a content file would hold them. */
export type StoredPage = { title: string; data: Record<string, unknown>; body: string }

export function templateData(c: TemplateCandidate, d: TemplateDraft, today: string): StoredPage {
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    data: {
      title: d.title.trim(),
      description: d.description.trim(),
      h1: d.h1.trim(),
      lede: d.lede.trim(),
      keyword: c.keyword,
      category: c.category,
      type: c.type,
      industries: c.industries,
      teams: c.teams,
      roles: c.roles.map((r) => ({ id: r.id, label: r.label, you: Boolean(r.you) })),
      variables: Object.fromEntries(d.variables.map((v) => [v.name.trim(), v.sample.trim()])),
      about: d.about.trim(),
      published: today,
      updated: today,
      faq: d.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
    },
  }
}

export function registryData(c: CompetitorCandidate | ComplianceCandidate, d: PageDraft, { today, sources }: { today: string; sources: Source[] }): StoredPage {
  return {
    title: d.title.trim(),
    body: d.body.trim(),
    data: {
      title: d.title.trim(),
      description: d.description.trim(),
      h1: d.h1.trim(),
      lede: d.lede.trim(),
      primaryKeyword: c.keyword,
      aliases: [...new Set(d.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
      published: today,
      updated: today,
      breadcrumb: d.breadcrumb.trim(),
      ...(c.kind === "compliance" ? {} : { competitor: c.competitor }),
      // A comparison's facts were fetched today; a law page's were verified on the day the facts were read.
      checked: c.kind === "compliance" ? c.verified : today,
      sources,
      benefits: d.benefits.map((b) => ({ title: b.title.trim(), body: b.body.trim() })),
      faq: d.faq.map((f) => ({ q: f.q.trim(), a: f.a.trim() })),
      related: [...new Set(d.related)],
    },
  }
}

// ─── Stored data → the app's own page types ─────────────────────────────────

/** A stored template as the library's Template, or the reasons it is not one. */
export function toTemplate(slug: string, stored: { data: unknown; body: string }): { template: Template } | { problems: string[] } {
  const parsed = templateSchema.safeParse(stored.data)
  if (!parsed.success) return { problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }
  const body = fillSite(stored.body.trim())
  return { template: { ...fillSite(parsed.data), slug, path: templatePath(slug), body, fields: fieldTokens(body) } }
}

/** A stored comparison, alternative or law page as a registry SitePage, or the reasons it is not one. */
export function toSitePage(kind: PageKind, slug: string, stored: { data: unknown; body: string }): { page: SitePage } | { problems: string[] } {
  const parsed = frontmatterSchema.safeParse({ ...(stored.data as object), kind })
  if (!parsed.success) return { problems: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }
  return { page: { ...fillSite(parsed.data), slug, locale: "en", path: pagePath(kind, slug), body: fillSite(stored.body.trim()), locales: ["en"] } }
}

// ─── Checks ──────────────────────────────────────────────────────────────────

/** Problems with a template draft under the library's own rules, against the existing templates (duplicate titles, keywords…). */
export function templateProblems(slug: string, stored: StoredPage, existing: Template[]): string[] {
  const result = toTemplate(slug, stored)
  if ("problems" in result) return result.problems
  const path = result.template.path
  return validateTemplates([...existing.filter((t) => t.slug !== slug), result.template]).filter((p) => p.startsWith(`${path}:`) || p.includes(`as ${path}`))
}

/**
 * Problems with a registry draft under the registry's rules, against the
 * existing pages. Similarity problems are left out: the duplicate gate
 * decides those, and its answer is "flag", not "fail".
 */
export function registryProblems(kind: PageKind, slug: string, stored: StoredPage, existing: SitePage[], knownPaths: Set<string>): string[] {
  const result = toSitePage(kind, slug, stored)
  if ("problems" in result) return result.problems
  const page = result.page
  return validatePages([...existing.filter((p) => p.path !== page.path), page], knownPaths)
    .filter((p) => p.startsWith(`${page.path}:`) || p.includes(`belongs to ${page.path}`) || p.includes(`as ${page.path}`))
    .filter((p) => !/% alike$/.test(p))
}

/**
 * A law page may cite only what it was given: every "Act NNN" must be one of
 * the candidate's statutes, every "section N" of Act 772 one of the sections
 * its facts cite, and it must cite at least five sections so it is a page
 * about the law and not about the topic. Returns the problems.
 */
export function citationProblems(markdown: string, c: ComplianceCandidate): string[] {
  const problems: string[] = []
  const allowedActs = new Set(c.acts.map((a) => a.toLowerCase().replace(/\s+/g, " ")))
  const acts = [...markdown.matchAll(/\bAct\s+(\d{1,4})\b/g)].map((m) => `act ${m[1]}`)
  const unknownActs = [...new Set(acts.filter((a) => !allowedActs.has(a)))]
  if (unknownActs.length) problems.push(`cites statutes it was not given: ${unknownActs.join(", ")}`)
  const allowedSections = new Set(c.facts.flatMap((f) => [...f.cite.matchAll(/\d+(?:\(\d+\))?/g)].map((m) => m[0].replace(/\(.*$/, ""))))
  const sections = [...markdown.matchAll(/\b[Ss]ections?\s+(\d+)(?:\(\d+\))?(?:\s*(?:,|and|to)\s*(\d+))?/g)].flatMap((m) => [m[1], m[2]].filter(Boolean) as string[])
  const unknownSections = [...new Set(sections.filter((s) => !allowedSections.has(s)))]
  if (unknownSections.length) problems.push(`cites sections that are not in its verified facts: ${unknownSections.join(", ")}`)
  if (new Set(sections).size < 5) problems.push(`cites ${new Set(sections).size} sections of the law, needs at least 5`)
  if (!/not legal advice/i.test(markdown)) problems.push("does not say it is general information, not legal advice")
  return problems
}

/** The page's intro for the uniqueness gate: the lede, plus the first paragraph of the explainer or body. */
export function introOf(draft: { lede: string; about?: string; body?: string }): string {
  const firstParagraph = (md = "") => md.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !p.startsWith("*This")) ?? ""
  return `${draft.lede.trim()} ${firstParagraph("about" in draft && draft.about ? draft.about : draft.body)}`.trim()
}

/** The candidate's family, for picking which pages are its siblings. */
export function familyOf(c: PageCandidate): "template" | "compare" | "law" {
  return c.kind === "template" ? "template" : c.kind === "compliance" ? "law" : "compare"
}
