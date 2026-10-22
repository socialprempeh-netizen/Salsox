/**
 * The SEO agent's page mode, which replaced its daily blog article: each run
 * writes one new page of a type with proven conversion data (a document
 * template, a comparison or alternatives page, or an e-signature law page)
 * from the curated queue in page-queue.ts, puts it through the quality gates
 * (quality.ts), and saves it as a draft, flags it, or publishes it.
 *
 *  - runPageGeneration: pick the next candidate, gather its facts, have
 *    Claude write it, gate it (one retry with the reasons when a fixable gate
 *    fails), save it, and publish it when the review rule allows (policy.ts:
 *    the first three wait for a person, then auto-publish unless "review
 *    every one" is on). A near-duplicate is saved FLAGGED and noindexed and
 *    never published on its own. Missing data stops the page being written.
 *  - publishGeneratedPage / unpublishGeneratedPage / discardGeneratedPage:
 *    what the admin tab's buttons do.
 *
 * The site comes in through a PageSite adapter (site.ts implements it), like
 * the article mode's SiteAdapter, so this file knows nothing of the app's
 * routes. Every run is logged with a plain outcome; failures are recorded,
 * never thrown to the cron, and no secret ever appears in a message.
 */
import type { SitePage } from "@/lib/seo/pages"
import { relatedTemplates, type Template } from "@/lib/templates"
import { TEMPLATE_INDUSTRIES, TEMPLATE_TEAMS } from "@/lib/templates-taxonomy"
import { covers } from "./dedupe"
import {
  citationProblems,
  introOf,
  registryData,
  registryProblems,
  REGISTRY_KIND,
  STORED_KIND,
  CANDIDATE_KIND,
  storedPath,
  templateData,
  templateDraftSchema,
  templateProblems,
  pageDraftSchema,
  toTemplate,
  type PageDraft,
  type StoredPage,
  type TemplateDraft,
} from "./page-draft"
import { complianceSystemPrompt, complianceUserPrompt, comparisonSystemPrompt, comparisonUserPrompt, templateSystemPrompt, templateUserPrompt } from "./page-prompt"
import { ALL_CANDIDATES, OFF_MARKET_PATHS, candidatePath, candidateSubject, pickCandidate, type CompetitorCandidate, type ComplianceCandidate, type PageCandidate, type TemplateCandidate } from "./page-queue"
import { shouldAutoPublish } from "./policy"
import type { SitePath } from "./prompt"
import { DUPLICATE_THRESHOLD, duplicateGate, failures, introGate, linksGate, requiredGate, verdict, type CorpusEntry, type Gate, type IntroInput, type QualityReport } from "./quality"
import { verifyLaw } from "./law-verify"
import type { FetchedSource, FullText } from "./source-fetch"
import * as store from "./store"
import { writePageDraft } from "./writer"

/** A blog post as the page mode needs it: for duplicate checks and law-page siblings. */
export type BlogEntry = { path: string; title: string; category: string; body: string }

export type PageSite = {
  productSummary: string
  /** The template library: files and published generated templates. */
  templates(): Promise<Template[]>
  /** Registry pages of the families the agent writes: files and published generated pages. */
  registry(kinds: SitePage["kind"][]): Promise<SitePage[]>
  /** Every registry page (all kinds), for the duplicate check. */
  allRegistry(): Promise<SitePage[]>
  blogPosts(): Promise<BlogEntry[]>
  /** Pages a generated page may link to, with what each one is. */
  sitePaths(): Promise<SitePath[]>
  /** Titles, headings and keywords of everything that exists, so a candidate the site covers is skipped. */
  coveredPhrases(): Promise<string[]>
  fetchSource(source: { label: string; url: string }): Promise<FetchedSource>
  /** A source's whole text (HTML, .doc or .docx), for verifying a law page's facts against the statute. */
  readFullText(source: { url: string; format?: "html" | "doc" | "docx" }): Promise<FullText>
  /** Refreshes the pages a newly published (or withdrawn) page appears on. */
  revalidateFor(kind: store.NewPage["kind"], path: string): void
  today(): string
}

export function missingPageSettings(env: Record<string, string | undefined> = process.env): string[] {
  return env.ANTHROPIC_API_KEY?.trim() ? [] : ["ANTHROPIC_API_KEY"]
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500)

/** The first paragraph-ish text of a page, for intro comparisons. */
const pageIntro = (p: SitePage): IntroInput => ({
  path: p.path,
  text: introOf({ lede: p.lede, body: p.body }),
  terms: [p.competitor?.name, p.breadcrumb.replace(/^vs\s+/i, "").replace(/\s+alternatives$/i, ""), p.primaryKeyword].filter((t): t is string => Boolean(t)),
})

const templateIntro = (t: Template): IntroInput => ({ path: t.path, text: introOf({ lede: t.lede, about: t.about }), terms: [t.h1.replace(/\s+template$/i, ""), t.keyword.replace(/\s+template$/i, "")] })

/** One written attempt: the stored page, its gates, and the model that wrote it. */
type Attempt = { stored: StoredPage; gates: Gate[]; report: QualityReport; model: string }

/** Thrown when a page cannot be written because its facts are missing; it is not retried in the same run. */
class MissingData extends Error {}

function report(gates: Gate[], dup: { score: number; closest: string | null }, intro: { score: number; closest: string | null }): QualityReport {
  return { gates, similarity: dup.score, similarTo: dup.closest, introSimilarity: intro.score, introSimilarTo: intro.closest }
}

// ── Templates ──────────────────────────────────────────────────────────────

async function writeTemplate(site: PageSite, c: TemplateCandidate, feedback?: string[]): Promise<Attempt> {
  const library = await site.templates()
  const sameCategory = library.filter((t) => t.category === c.category)
  const siblings = sameCategory.length >= 3 ? sameCategory : library.filter((t) => t.type === c.type)
  const reference = library.find((t) => t.type === c.type && t.category === c.category) ?? library.find((t) => t.type === c.type) ?? null
  const { draft, model } = await writePageDraft({
    system: templateSystemPrompt(),
    user: templateUserPrompt({
      candidate: c,
      productSummary: site.productSummary,
      reference: reference ? { title: reference.h1, markdown: `Lede: ${reference.lede}\n\nAbout:\n${reference.about}\n\nDocument:\n${reference.body}` } : null,
      siblingIntros: siblings.slice(0, 10).map((t) => t.lede),
      feedback,
    }),
    schema: templateDraftSchema,
  })
  const stored = templateData(c, draft as TemplateDraft, site.today())
  const path = candidatePath(c)

  const required = requiredGate(draft)
  const ruleProblems = templateProblems(c.slug, stored, library)
  const requiredAll: Gate = ruleProblems.length ? { id: "required", ok: false, detail: [required.ok ? "" : required.detail, ...ruleProblems].filter(Boolean).join("; ") } : required

  const intro = introGate({ path, text: introOf(draft as TemplateDraft), terms: candidateSubject(c) }, siblings.map(templateIntro))

  // Hub and spoke: the template's related cards and its industry and team pages.
  const built = toTemplate(c.slug, stored)
  const related = "template" in built ? relatedTemplates(built.template, library, 6).map((t) => t.path) : []
  const known = new Set([...library.map((t) => t.path), ...Object.values(TEMPLATE_INDUSTRIES), ...Object.values(TEMPLATE_TEAMS)])
  const links = linksGate([...related, ...c.industries.map((i) => TEMPLATE_INDUSTRIES[i])], { known, siblings: new Set(sameCategory.map((t) => t.path)), self: path })

  const corpus: CorpusEntry[] = library.map((t) => ({ path: t.path, text: `${t.body}\n\n${t.about}` }))
  const dup = duplicateGate(`${stored.body}\n\n${String(stored.data.about)}`, corpus, DUPLICATE_THRESHOLD.template)

  const gates = [requiredAll, intro.gate, links, dup.gate]
  return { stored, gates, report: report(gates, dup, intro), model }
}

// ── Comparisons and alternatives ──────────────────────────────────────────

async function writeCompetitorPage(site: PageSite, c: CompetitorCandidate, fetched: FetchedSource[], feedback?: string[]): Promise<Attempt> {
  const readable = fetched.filter((s) => s.ok)
  const family = await site.registry(["comparison", "alternative"])
  const reference = family.find((p) => p.kind === c.kind) ?? null
  const paths = await site.sitePaths()
  const { draft, model } = await writePageDraft({
    system: comparisonSystemPrompt(),
    user: comparisonUserPrompt({
      candidate: c,
      productSummary: site.productSummary,
      sources: readable,
      paths,
      siblingIntros: family.slice(0, 12).map((p) => p.lede),
      reference: reference ? { title: reference.h1, markdown: reference.body } : null,
      today: site.today(),
      feedback,
    }),
    schema: pageDraftSchema,
  })
  return gateRegistryPage(site, c, draft as PageDraft, { sources: readable.map(({ label, url }) => ({ label, url })), family, paths, model })
}

// ── Law pages ──────────────────────────────────────────────────────────────

const isLawPost = (p: BlogEntry) => /legal|law/i.test(p.category) || /\b(legal|law|laws|binding)\b/i.test(p.title)

async function writeCompliancePage(site: PageSite, c: ComplianceCandidate, feedback?: string[]): Promise<Attempt> {
  const family = await site.registry(["compliance"])
  // Pages about markets that are not targets are never offered as links.
  const paths = (await site.sitePaths()).filter((p) => !OFF_MARKET_PATHS.has(p.path))
  const lawPosts = (await site.blogPosts()).filter((p) => isLawPost(p) && !OFF_MARKET_PATHS.has(p.path))
  const { draft, model } = await writePageDraft({
    system: complianceSystemPrompt(),
    user: complianceUserPrompt({
      candidate: c,
      productSummary: site.productSummary,
      paths,
      siblingIntros: [...family.map((p) => p.lede), ...lawPosts.map((p) => introOf({ lede: "", body: p.body }))].slice(0, 12),
      feedback,
    }),
    schema: pageDraftSchema,
  })
  return gateRegistryPage(site, c, draft as PageDraft, { sources: c.sources, family, paths, model, lawPosts })
}

/** The gates for a comparison, alternative or law page, which share the registry's rules. */
async function gateRegistryPage(
  site: PageSite,
  c: CompetitorCandidate | ComplianceCandidate,
  draft: PageDraft,
  ctx: { sources: { label: string; url: string }[]; family: SitePage[]; paths: SitePath[]; model: string; lawPosts?: BlogEntry[] }
): Promise<Attempt> {
  const kind = REGISTRY_KIND[STORED_KIND[c.kind] as Exclude<store.NewPage["kind"], "TEMPLATE">]
  const stored = registryData(c, draft, { today: site.today(), sources: ctx.sources })
  const path = candidatePath(c)
  const all = await site.allRegistry()
  const known = new Set(ctx.paths.map((p) => p.path))

  // Aliases may rightly be empty; every other field must be filled.
  const required = requiredGate(Object.fromEntries(Object.entries(draft).filter(([key]) => key !== "aliases")))
  const ruleProblems = registryProblems(kind, c.slug, stored, all, known)
  const requiredAll: Gate = ruleProblems.length ? { id: "required", ok: false, detail: [required.ok ? "" : required.detail, ...ruleProblems].filter(Boolean).join("; ") } : required

  const lawPosts = ctx.lawPosts ?? []
  const introSiblings = [...ctx.family.map(pageIntro), ...lawPosts.map((p) => ({ path: p.path, text: introOf({ lede: "", body: p.body }), terms: c.kind === "compliance" ? [c.country] : [] }))]
  const intro = introGate({ path, text: introOf(draft), terms: candidateSubject(c) }, introSiblings)

  // A law page's siblings are the law guides on the blog until it has law pages beside it.
  const siblings = new Set([...ctx.family.map((p) => p.path), ...lawPosts.map((p) => p.path)])
  const links = linksGate(draft.related, { known, siblings, self: path })

  const corpus: CorpusEntry[] = [...all.map((p) => ({ path: p.path, text: p.body })), ...(await site.blogPosts()).map((p) => ({ path: p.path, text: p.body }))]
  const dup = duplicateGate(stored.body, corpus, DUPLICATE_THRESHOLD.page)

  const gates: Gate[] = [requiredAll, intro.gate, links, dup.gate]
  if (c.kind === "compliance") {
    const problems = citationProblems(stored.body, c)
    gates.push({ id: "facts", ok: problems.length === 0, detail: problems.length ? problems.join("; ") : "cites only verified statutes and sections" })
  }
  return { stored, gates, report: report(gates, dup, intro), model: ctx.model }
}

// ── The run ────────────────────────────────────────────────────────────────

export type PageRunResult = { status: store.RunStatus; message: string; pageId?: string; published?: boolean }

async function attempt(site: PageSite, c: PageCandidate, fetched: FetchedSource[], feedback?: string[]): Promise<Attempt> {
  switch (c.kind) {
    case "template":
      return writeTemplate(site, c, feedback)
    case "comparison":
    case "alternative":
      return writeCompetitorPage(site, c, fetched, feedback)
    case "compliance":
      return writeCompliancePage(site, c, feedback)
  }
}

/**
 * The candidate's facts that come from outside, checked now: a comparison's
 * sources are fetched, and a law page's facts are verified against the
 * official text of every statute they cite (law-verify.ts). Throws
 * MissingData when a comparison has too few readable sources, or when any
 * law cannot be verified, so the page is never written on unchecked facts.
 */
async function gatherFacts(site: PageSite, c: PageCandidate): Promise<FetchedSource[]> {
  if (c.kind === "compliance") {
    const problems = await verifyLaw(c, (source) => site.readFullText(source))
    if (problems.length) throw new MissingData(`the source law could not be verified: ${problems.join("; ")}`)
    return []
  }
  if (c.kind !== "comparison" && c.kind !== "alternative") return []
  const fetched = await Promise.all(c.sources.map((s) => site.fetchSource(s)))
  const readable = fetched.filter((s) => s.ok)
  // A comparison stands on the competitor's own page; a round-up on at least two of its alternatives'.
  const needed = c.kind === "comparison" ? 1 : 2
  if (readable.length < needed) {
    throw new MissingData(`not enough readable sources (${readable.length} of ${needed} needed): ${fetched.filter((s) => !s.ok).map((s) => `${s.url} (${s.reason})`).join(", ")}`)
  }
  return fetched
}

export async function runPageGeneration(site: PageSite, trigger: store.RunTrigger): Promise<PageRunResult> {
  const runId = await store.startRun("pages", trigger)
  if (!runId) return { status: "skipped", message: "Another page run is in progress." }
  const finish = async (result: PageRunResult & { candidates?: number }) => {
    await store.finishRun(runId, { status: result.status === "running" ? "failed" : result.status, message: result.message, candidates: result.candidates })
    return result
  }

  const missing = missingPageSettings()
  if (missing.length) return finish({ status: "skipped", message: `Not configured: set ${missing.join(" and ")}.` })

  // 1. The next candidate nothing covers yet.
  const states = (await store.pageStates()).map((s) => ({ kind: CANDIDATE_KIND[s.kind], slug: s.slug, status: s.status, attempts: s.attempts }))
  const phrases = await site.coveredPhrases()
  const existingPaths = new Set([...(await site.templates()).map((t) => t.path), ...(await site.allRegistry()).map((p) => p.path)])
  const covered = (c: PageCandidate) => existingPaths.has(candidatePath(c)) || phrases.some((p) => covers(p, c.keyword))
  const candidate = pickCandidate(ALL_CANDIDATES, states, covered)
  if (!candidate) return finish({ status: "skipped", message: "Every page in the queue is written, set aside after failing twice, or already covered by the site. Add candidates in page-queue.ts." })

  const kind = STORED_KIND[candidate.kind]
  const path = candidatePath(candidate)
  const label = `${candidate.kind} page ${path}`
  site.revalidateFor(kind, "/admin/seo/agent")

  // 2. Facts, then the page, with one retry when a fixable gate fails.
  let result: Attempt
  try {
    const fetched = await gatherFacts(site, candidate)
    result = await attempt(site, candidate, fetched)
    if (verdict(result.report.gates) === "fail") result = await attempt(site, candidate, fetched, failures(result.report.gates))
  } catch (error) {
    const why = error instanceof MissingData ? `missing data, ${error.message}` : errorText(error)
    await store.recordPageFailure({ kind, slug: candidate.slug, title: candidate.keyword, error: why })
    return finish({ status: "failed", candidates: 1, message: `The ${label} was not generated: ${why}` })
  }

  const outcome = verdict(result.report.gates)
  if (outcome === "fail") {
    const why = failures(result.report.gates).join(" | ")
    await store.recordPageFailure({ kind, slug: candidate.slug, title: result.stored.title || candidate.keyword, error: why, report: result.report })
    return finish({ status: "failed", candidates: 1, message: `The ${label} failed its quality gates twice and was not generated: ${why}` })
  }

  // 3. Saved: flagged and noindexed when too close to an existing page, otherwise a draft.
  const writtenBefore = await store.countWrittenPages()
  const pageId = await store.savePage({
    kind,
    slug: candidate.slug,
    status: outcome === "flag" ? "FLAGGED" : "DRAFT",
    title: result.stored.title,
    data: result.stored.data,
    body: result.stored.body,
    report: result.report,
    similarity: result.report.similarity,
    similarTo: result.report.similarTo,
    noindex: outcome === "flag",
    model: result.model,
  })
  if (outcome === "flag") {
    site.revalidateFor(kind, "/admin/seo/agent")
    return finish({ status: "ok", candidates: 1, pageId, published: false, message: `Wrote "${result.stored.title}" (${path}), but it is ${(result.report.similarity * 100).toFixed(0)}% alike to ${result.report.similarTo}: flagged and noindexed, not published.` })
  }

  // 4. Draft, or straight to the site under the review rule.
  const { draftFirst } = await store.getSettings()
  if (shouldAutoPublish({ writtenBefore, draftFirst })) {
    const published = await publishGeneratedPage(site, pageId, { auto: true })
    return finish({ status: "ok", candidates: 1, pageId, published: published.ok, message: `Wrote and published "${result.stored.title}" at ${path}. ${published.message}` })
  }
  site.revalidateFor(kind, "/admin/seo/agent")
  return finish({ status: "ok", candidates: 1, pageId, published: false, message: `Wrote a draft, "${result.stored.title}" (${path}). It is waiting for review.` })
}

// ── What the admin buttons do ─────────────────────────────────────────────

export async function publishGeneratedPage(site: PageSite, id: string, { auto }: { auto: boolean }): Promise<{ ok: boolean; message: string }> {
  const page = await store.getGeneratedPage(id)
  if (!page) return { ok: false, message: "That page no longer exists." }
  if (page.status === "PUBLISHED") return { ok: true, message: "It was already published." }
  if (page.status !== "DRAFT" && page.status !== "FLAGGED") return { ok: false, message: "Only a draft or a flagged page can be published." }
  // A flagged page is published only by a person, and only noindexed.
  if (auto && page.status === "FLAGGED") return { ok: false, message: "A flagged page is never published automatically." }
  await store.markPagePublished(id, { auto })
  const path = storedPath(page.kind, page.slug)
  site.revalidateFor(page.kind, path)
  return { ok: true, message: page.status === "FLAGGED" ? `Live at ${path}, noindexed and left out of the sitemap and hubs.` : `Live at ${path}, listed in its hub and linked from its neighbours.` }
}

export async function unpublishGeneratedPage(site: PageSite, id: string): Promise<boolean> {
  const page = await store.getGeneratedPage(id)
  if (!page || !(await store.markPageUnpublished(id))) return false
  site.revalidateFor(page.kind, storedPath(page.kind, page.slug))
  return true
}

export async function discardGeneratedPage(site: PageSite, id: string): Promise<boolean> {
  const page = await store.getGeneratedPage(id)
  if (!page || !(await store.markPageDiscarded(id))) return false
  site.revalidateFor(page.kind, "/admin/seo/agent")
  return true
}
