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
import { STAT_IDS } from "@/lib/seo/stats"
import type { ComplianceCandidate, CompetitorCandidate, PageCandidate, PageCandidateKind, Source, TemplateCandidate, UseCaseCandidate } from "./page-queue"

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

/**
 * An industry, role or market page (page-matrix.ts): a registry page plus
 * its use-case blocks, one per document the audience signs. The stats bar
 * is not the model's: the page carries every stat id (src/lib/seo/stats.ts).
 */
export const useCaseDraftSchema = pageDraftSchema.extend({ useCases: z.array(titled) })
export type UseCaseDraft = z.infer<typeof useCaseDraftSchema>

export type AnyDraft = TemplateDraft | PageDraft | UseCaseDraft

// ─── Kinds ───────────────────────────────────────────────────────────────────

// USE_CASE was added for the page matrix's industry, role and market pages.
export type StoredKind = "TEMPLATE" | "COMPARISON" | "ALTERNATIVE" | "COMPLIANCE" | "USE_CASE"

export const STORED_KIND: Record<PageCandidateKind, StoredKind> = { template: "TEMPLATE", comparison: "COMPARISON", alternative: "ALTERNATIVE", compliance: "COMPLIANCE", "use-case": "USE_CASE" }
export const CANDIDATE_KIND: Record<StoredKind, PageCandidateKind> = { TEMPLATE: "template", COMPARISON: "comparison", ALTERNATIVE: "alternative", COMPLIANCE: "compliance", USE_CASE: "use-case" }

/** The registry kind a stored page renders as; templates are not registry pages. */
export const REGISTRY_KIND: Record<Exclude<StoredKind, "TEMPLATE">, PageKind> = { COMPARISON: "comparison", ALTERNATIVE: "alternative", COMPLIANCE: "compliance", USE_CASE: "use-case" }

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

export function registryData(c: CompetitorCandidate | ComplianceCandidate | UseCaseCandidate, d: PageDraft | UseCaseDraft, { today, sources }: { today: string; sources: Source[] }): StoredPage {
  // A market page cites its country's law the way a law page does; an
  // industry or role page has no outside facts to date.
  const checked = c.kind === "compliance" ? c.verified : c.kind === "use-case" ? c.market?.law.verified : today
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
      ...(c.kind === "comparison" || c.kind === "alternative" ? { competitor: c.competitor } : {}),
      ...(c.kind !== "compliance" && c.kind !== "use-case" && c.rival ? { rivals: [{ name: c.rival.name, url: c.rival.url }] } : {}),
      // A comparison's facts were fetched today; a law page's were verified on the day the facts were read.
      // Was: checked: c.kind === "compliance" ? c.verified : today,
      ...(checked ? { checked } : {}),
      sources,
      benefits: d.benefits.map((b) => ({ title: b.title.trim(), body: b.body.trim() })),
      ...(c.kind === "use-case" && "useCases" in d
        ? { stats: [...STAT_IDS], useCases: d.useCases.map((u) => ({ title: u.title.trim(), body: u.body.trim() })), ...(c.templates ? { templates: { industry: c.templates } } : {}) }
        : {}),
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
 * The provision numbers a text refers to, lower case: "section 11(3)",
 * "subsection 48(1)", "s. 7", "§ 126a", "§§ 780 and 781", "Article 25(2)",
 * "Art. 3", "15 U.S.C. § 7001(a)". Lists ("sections 23 and 24", "§§ 780,
 * 781") count each number. Sub-paragraphs in brackets are ignored: a page
 * citing 7001(c) cites section 7001.
 */
export function provisionRefs(text: string): string[] {
  const number = String.raw`(\d+[A-Za-z]?)(?:\([^)\s]*\))*`
  const rest = String.raw`((?:\s*(?:,|and|or|to|-|–)\s*\d+[A-Za-z]?(?:\([^)\s]*\))*)*)`
  const pattern = new RegExp(String.raw`(?:\b(?:[Ss]ub)?[Ss]ections?|\bss?\.|§§?|\bArticles?|\bArt\.)\s*` + number + rest, "g")
  const out: string[] = []
  for (const m of text.matchAll(pattern)) {
    out.push(m[1])
    for (const n of (m[2] ?? "").matchAll(/(\d+[A-Za-z]?)/g)) out.push(n[1])
  }
  return out.map((r) => r.toLowerCase())
}

/** Words that, right before "Act" or "Regulation", make it a reference back ("the Act", "the Ontario Act"), not a statute's name. */
const GENERIC_BEFORE = new Set("the this that these each its an a which same such any other federal provincial state ontario canadian american german british english uk us eu".split(" "))

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w))

/**
 * Statutes a page names that it was not given. For every "Act" or
 * "Regulation(s)" in the text, the words before it (within the sentence) must
 * end in one of the candidate's statute names, so "the Electronic Commerce
 * Act" passes and "the Privacy Act" or "the Data Protection Act" does not.
 * A bare back-reference ("the Act", "this Regulation") passes.
 */
export function unknownStatutes(markdown: string, statutes: string[]): string[] {
  const names = statutes.map((n) => words(n).join(" "))
  const unknown = new Set<string>()
  for (const m of markdown.matchAll(/\b(Act|Regulations?)\b/g)) {
    const before = markdown.slice(Math.max(0, m.index! - 160), m.index!)
    const sentence = before.split(/[.!?:;]\s|\n/).pop() ?? ""
    const preceding = words(sentence).slice(-10)
    const head = words(m[1])[0]
    if (preceding.length === 0 || GENERIC_BEFORE.has(preceding[preceding.length - 1])) continue
    // The longest run of words right before "Act" that ends some allowed name.
    let matched = 0
    for (let n = 1; n <= preceding.length; n++) {
      const phrase = `${preceding.slice(-n).join(" ")} ${head}`
      if (names.some((name) => name === phrase || name.endsWith(` ${phrase}`) || name.includes(` ${phrase} `) || name.startsWith(`${phrase} `))) matched = n
    }
    if (matched === 0) unknown.add(`${preceding.slice(-3).join(" ")} ${m[1]}`)
  }
  return [...unknown]
}

/**
 * A law page may cite only what it was given: every statute it names must be
 * one of the candidate's (unknownStatutes), every section, subsection,
 * article or § it cites must appear in its verified facts, and it must cite
 * at least five provisions so it is a page about the law and not about the
 * topic. It must also say it is not legal advice. Returns the problems.
 */
// `minProvisions` was added for market pages (an industry in one country),
// which cite the law where it bears on the industry's documents rather than
// walking through the statute; law pages keep the default of five.
export function citationProblems(markdown: string, c: ComplianceCandidate, minProvisions = 5): string[] {
  const problems: string[] = []
  // Was: Ghana's statutes by number ("Act 772"); law pages now name their
  // statutes, and cite sections, articles and paragraphs (§) as each country does.
  const unknownActs = unknownStatutes(markdown, c.statutes)
  if (unknownActs.length) problems.push(`names statutes it was not given: ${unknownActs.join(", ")}`)
  const allowed = new Set(c.facts.flatMap((f) => [...provisionRefs(f.cite), ...provisionRefs(f.text)]))
  const cited = provisionRefs(markdown)
  const unknownRefs = [...new Set(cited.filter((r) => !allowed.has(r)))]
  if (unknownRefs.length) problems.push(`cites provisions that are not in its verified facts: ${unknownRefs.join(", ")}`)
  const distinct = new Set(cited).size
  if (distinct < minProvisions) problems.push(`cites ${distinct} provisions of the law, needs at least ${minProvisions}`)
  if (!/not legal advice/i.test(markdown)) problems.push("does not say it is general information, not legal advice")
  return problems
}

/** The page's intro for the uniqueness gate: the lede, plus the first paragraph of the explainer or body. */
export function introOf(draft: { lede: string; about?: string; body?: string }): string {
  const firstParagraph = (md = "") => md.split(/\n\s*\n/).map((p) => p.trim()).find((p) => p && !p.startsWith("#") && !p.startsWith("|") && !p.startsWith("*This")) ?? ""
  return `${draft.lede.trim()} ${firstParagraph("about" in draft && draft.about ? draft.about : draft.body)}`.trim()
}

/** The candidate's family, for picking which pages are its siblings. */
// "industry" was added for the page matrix's use-case pages.
export function familyOf(c: PageCandidate): "template" | "compare" | "law" | "industry" {
  return c.kind === "template" ? "template" : c.kind === "compliance" ? "law" : c.kind === "use-case" ? "industry" : "compare"
}
