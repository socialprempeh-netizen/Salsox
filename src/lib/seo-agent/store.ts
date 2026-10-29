/**
 * The SEO agent's memory: every read and write of its seven tables
 * (prisma/schema.prisma, "SEO agent"), and nothing else. Decisions are made
 * in the pure files beside this one; this only moves rows.
 *
 * Reads that public pages make while rendering (published articles, the
 * links to splice into a page) never throw: if the database is unreachable
 * or the migration has not run yet, the page renders without them and says
 * so in the server log, because a blog post must not fail over an extra.
 */
import type { Prisma, SeoAgentPageKind, SeoAgentPageStatus, SeoAgentTargetStatus } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { Opportunity } from "./opportunities"

// "pages" is the page mode's daily run (page-agent.ts); "daily" the article mode it replaced.
export type RunKind = "daily" | "orphans" | "pages"
export type RunTrigger = "cron" | "manual"
export type RunStatus = "running" | "ok" | "skipped" | "failed"

/** A run still "running" after this long died without finishing (a timeout), and no longer blocks a new one. */
const STALE_RUN_MS = 15 * 60_000

async function quietly<T>(what: string, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read()
  } catch (error) {
    console.error(`[seo-agent] ${what} failed:`, error instanceof Error ? error.message : error)
    return fallback
  }
}

// ── Settings ──────────────────────────────────────────────────────────────

export async function getSettings(): Promise<{ draftFirst: boolean }> {
  const row = await prisma.seoAgentSettings.findUnique({ where: { id: 1 } })
  return { draftFirst: row?.draftFirst ?? false }
}

export async function setDraftFirst(draftFirst: boolean): Promise<void> {
  await prisma.seoAgentSettings.upsert({ where: { id: 1 }, create: { id: 1, draftFirst }, update: { draftFirst } })
}

// ── Runs ──────────────────────────────────────────────────────────────────

/** Opens a run, or returns null when one of the same kind is already running. */
export async function startRun(kind: RunKind, trigger: RunTrigger): Promise<string | null> {
  const busy = await prisma.seoAgentRun.findFirst({ where: { kind, status: "running", startedAt: { gt: new Date(Date.now() - STALE_RUN_MS) } } })
  if (busy) return null
  const run = await prisma.seoAgentRun.create({ data: { kind, trigger, status: "running" } })
  return run.id
}

export async function finishRun(id: string, outcome: { status: Exclude<RunStatus, "running">; message: string; candidates?: number; targetId?: string | null }): Promise<void> {
  await prisma.seoAgentRun.update({
    where: { id },
    data: { status: outcome.status, message: outcome.message.slice(0, 2000), candidates: outcome.candidates ?? 0, targetId: outcome.targetId ?? null, finishedAt: new Date() },
  })
}

export async function lastFinishedRun(kind: RunKind) {
  return prisma.seoAgentRun.findFirst({ where: { kind, status: { not: "running" } }, orderBy: { startedAt: "desc" } })
}

export async function recentRuns(limit = 30) {
  return prisma.seoAgentRun.findMany({ orderBy: { startedAt: "desc" }, take: limit })
}

// ── Targets and articles ─────────────────────────────────────────────────

/** How many times a target may be tried before its keyword is set aside for good. */
export const MAX_ATTEMPTS = 2

/** Keywords no longer available to pick: every target except a failed one with a retry left. */
export async function targetKeywords(): Promise<string[]> {
  const rows = await prisma.seoAgentTarget.findMany({ where: { NOT: { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } } }, select: { keyword: true } })
  return rows.map((r) => r.keyword)
}

/** Every slug an agent article holds, published or not, so a new one never collides. */
export async function articleSlugs(): Promise<Set<string>> {
  const rows = await prisma.seoAgentArticle.findMany({ select: { slug: true } })
  return new Set(rows.map((r) => r.slug))
}

/** Titles of every article the agent wrote, for the coverage check. */
export async function articleTitles(): Promise<string[]> {
  const rows = await prisma.seoAgentArticle.findMany({ select: { title: true } })
  return rows.map((r) => r.title)
}

export async function countArticles(): Promise<number> {
  return prisma.seoAgentArticle.count()
}

/**
 * Claims a keyword: a new target, or a second attempt at one that failed.
 * Null when it is not available (another run claimed it, or it is spent).
 */
export async function createTarget(o: Opportunity): Promise<string | null> {
  const metrics = { impressions: o.impressions, clicks: o.clicks, position: o.position, score: o.score, page: o.page }
  try {
    const row = await prisma.seoAgentTarget.create({ data: { keyword: o.query, ...metrics } })
    return row.id
  } catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error
    const { count } = await prisma.seoAgentTarget.updateMany({
      where: { keyword: o.query, status: "FAILED", attempts: { lt: MAX_ATTEMPTS }, article: { is: null } },
      data: { ...metrics, status: "WRITING", error: null, attempts: { increment: 1 } },
    })
    if (count === 0) return null
    return (await prisma.seoAgentTarget.findUnique({ where: { keyword: o.query }, select: { id: true } }))?.id ?? null
  }
}

export async function setTargetStatus(id: string, status: SeoAgentTargetStatus, extra: { error?: string | null; publishedSlug?: string | null } = {}): Promise<void> {
  await prisma.seoAgentTarget.update({ where: { id }, data: { status, ...extra } })
}

export type NewArticle = { targetId: string; slug: string; title: string; description: string; category: string; keyword: string; body: string; faq: { q: string; a: string }[]; related: string[]; model: string }

export async function saveArticle(a: NewArticle): Promise<string> {
  const [article] = await prisma.$transaction([
    prisma.seoAgentArticle.create({ data: { ...a, faq: a.faq as Prisma.InputJsonValue } }),
    prisma.seoAgentTarget.update({ where: { id: a.targetId }, data: { status: "DRAFT", error: null } }),
  ])
  return article.id
}

export async function getArticle(id: string) {
  return prisma.seoAgentArticle.findUnique({ where: { id }, include: { target: true, links: true } })
}

export type StoredLink = { sourcePath: string; afterParagraph: number; sentence: string }

/** Publishes an article with its links, in one transaction. */
export async function markPublished(articleId: string, { links, auto }: { links: StoredLink[]; auto: boolean }): Promise<void> {
  const article = await prisma.seoAgentArticle.findUniqueOrThrow({ where: { id: articleId } })
  await prisma.$transaction([
    prisma.seoAgentLink.deleteMany({ where: { articleId } }),
    prisma.seoAgentLink.createMany({ data: links.map((l) => ({ ...l, articleId })) }),
    prisma.seoAgentArticle.update({ where: { id: articleId }, data: { publishedAt: article.publishedAt ?? new Date(), autoPublished: auto } }),
    prisma.seoAgentTarget.update({ where: { id: article.targetId }, data: { status: "PUBLISHED", publishedSlug: article.slug } }),
  ])
}

/** Takes an article off the site: back to a draft, and its links removed from the pages that carried them. */
export async function markUnpublished(articleId: string): Promise<{ sources: string[] } | null> {
  const article = await prisma.seoAgentArticle.findUnique({ where: { id: articleId }, include: { links: true } })
  if (!article) return null
  await prisma.$transaction([
    prisma.seoAgentLink.deleteMany({ where: { articleId } }),
    prisma.seoAgentArticle.update({ where: { id: articleId }, data: { publishedAt: null, autoPublished: false } }),
    prisma.seoAgentTarget.update({ where: { id: article.targetId }, data: { status: "DRAFT", publishedSlug: null } }),
  ])
  return { sources: article.links.map((l) => l.sourcePath) }
}

export async function markDiscarded(articleId: string): Promise<boolean> {
  const article = await prisma.seoAgentArticle.findUnique({ where: { id: articleId } })
  if (!article || article.publishedAt) return false
  await prisma.seoAgentTarget.update({ where: { id: article.targetId }, data: { status: "DISCARDED" } })
  return true
}

/** The admin list: newest targets first, with their article. */
export async function recentTargets(limit = 50) {
  return prisma.seoAgentTarget.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { article: { select: { id: true, slug: true, title: true, description: true, publishedAt: true, autoPublished: true, model: true, _count: { select: { links: true } } } } },
  })
}

// ── What public pages read ───────────────────────────────────────────────

export type PublishedArticle = {
  slug: string
  title: string
  description: string
  category: string
  keyword: string
  body: string
  faq: { q: string; a: string }[]
  related: string[]
  publishedAt: Date
  updatedAt: Date
}

const toPublished = (a: { slug: string; title: string; description: string; category: string; keyword: string; body: string; faq: Prisma.JsonValue; related: string[]; publishedAt: Date | null; updatedAt: Date }): PublishedArticle => ({
  ...a,
  faq: Array.isArray(a.faq) ? (a.faq as { q: string; a: string }[]) : [],
  publishedAt: a.publishedAt ?? a.updatedAt,
})

export async function publishedArticles(): Promise<PublishedArticle[]> {
  return quietly("reading published articles", [], async () => {
    const rows = await prisma.seoAgentArticle.findMany({ where: { publishedAt: { not: null }, target: { status: "PUBLISHED" } }, orderBy: { publishedAt: "desc" } })
    return rows.map(toPublished)
  })
}

export async function publishedArticle(slug: string): Promise<PublishedArticle | null> {
  return quietly("reading an article", null, async () => {
    const row = await prisma.seoAgentArticle.findFirst({ where: { slug, publishedAt: { not: null }, target: { status: "PUBLISHED" } } })
    return row ? toPublished(row) : null
  })
}

/** The links to splice into one page, each with the article it points to. */
export async function linksFrom(sourcePath: string): Promise<(StoredLink & { href: string })[]> {
  return quietly("reading links", [], async () => {
    const rows = await prisma.seoAgentLink.findMany({
      where: { sourcePath, article: { publishedAt: { not: null }, target: { status: "PUBLISHED" } } },
      include: { article: { select: { slug: true } } },
      orderBy: { createdAt: "asc" },
    })
    return rows.map((r) => ({ sourcePath: r.sourcePath, afterParagraph: r.afterParagraph, sentence: r.sentence, href: `/blog/${r.article.slug}` }))
  })
}

// ── Orphans ───────────────────────────────────────────────────────────────

/**
 * Replaces the orphan list with this crawl's findings: new ones open, ones
 * still orphaned keep their status (a page marked reviewed stays reviewed),
 * and pages that gained a link drop off.
 */
export async function replaceOrphans(paths: string[]): Promise<void> {
  const now = new Date()
  await prisma.$transaction([
    prisma.seoAgentOrphan.deleteMany({ where: { path: { notIn: paths } } }),
    ...paths.map((path) => prisma.seoAgentOrphan.upsert({ where: { path }, create: { path, lastSeenAt: now }, update: { lastSeenAt: now } })),
  ])
}

export async function listOrphans() {
  return prisma.seoAgentOrphan.findMany({ orderBy: [{ status: "asc" }, { path: "asc" }] })
}

export async function setOrphanStatus(path: string, status: "OPEN" | "REVIEWED"): Promise<boolean> {
  const { count } = await prisma.seoAgentOrphan.updateMany({ where: { path }, data: { status } })
  return count > 0
}

// ── Generated pages (the page mode, page-agent.ts) ───────────────────────

/** Every page row's kind, slug, status and attempts: what the candidate picker needs. */
export async function pageStates() {
  return prisma.seoAgentPage.findMany({ select: { kind: true, slug: true, status: true, attempts: true } })
}

/** Pages written, discarded and flagged included, failures not: the count the review rule runs on. */
export async function countWrittenPages(): Promise<number> {
  return prisma.seoAgentPage.count({ where: { status: { not: "FAILED" } } })
}

export type NewPage = {
  kind: SeoAgentPageKind
  slug: string
  status: Extract<SeoAgentPageStatus, "DRAFT" | "FLAGGED">
  title: string
  data: Record<string, unknown>
  body: string
  report: unknown
  similarity: number
  similarTo: string | null
  noindex: boolean
  model: string
}

/** Saves a written page; a candidate that failed before is overwritten in place. */
export async function savePage(p: NewPage): Promise<string> {
  const fields = { ...p, data: p.data as Prisma.InputJsonValue, report: p.report as Prisma.InputJsonValue, error: null }
  const row = await prisma.seoAgentPage.upsert({ where: { kind_slug: { kind: p.kind, slug: p.slug } }, create: fields, update: fields })
  return row.id
}

/** Records a candidate that could not be generated, and why; a second failure sets it aside (MAX_PAGE_ATTEMPTS). */
export async function recordPageFailure(f: { kind: SeoAgentPageKind; slug: string; title: string; error: string; report?: unknown }): Promise<void> {
  const report = f.report === undefined ? undefined : (f.report as Prisma.InputJsonValue)
  await prisma.seoAgentPage.upsert({
    where: { kind_slug: { kind: f.kind, slug: f.slug } },
    create: { kind: f.kind, slug: f.slug, title: f.title, status: "FAILED", error: f.error.slice(0, 2000), report },
    update: { status: "FAILED", error: f.error.slice(0, 2000), report, attempts: { increment: 1 } },
  })
}

export async function getGeneratedPage(id: string) {
  return prisma.seoAgentPage.findUnique({ where: { id } })
}

/** Puts a page live. A flagged page published by a person stays noindexed. */
export async function markPagePublished(id: string, { auto }: { auto: boolean }): Promise<void> {
  const page = await prisma.seoAgentPage.findUniqueOrThrow({ where: { id } })
  await prisma.seoAgentPage.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: page.publishedAt ?? new Date(), autoPublished: auto, noindex: page.noindex || page.status === "FLAGGED" } })
}

/** Takes a page off the site, back to a draft (or back to flagged, if it was published noindexed). */
export async function markPageUnpublished(id: string): Promise<boolean> {
  const page = await prisma.seoAgentPage.findUnique({ where: { id } })
  if (!page || page.status !== "PUBLISHED") return false
  await prisma.seoAgentPage.update({ where: { id }, data: { status: page.noindex ? "FLAGGED" : "DRAFT", publishedAt: null, autoPublished: false } })
  return true
}

/**
 * A failed page made available to the next run again, its attempts reset:
 * for a page set aside after its sources could not be read, once the cause
 * is fixed. Only a FAILED page.
 */
export async function resetPageFailure(id: string): Promise<boolean> {
  const { count } = await prisma.seoAgentPage.updateMany({ where: { id, status: "FAILED" }, data: { attempts: 0 } })
  return count > 0
}

export async function markPageDiscarded(id: string): Promise<boolean> {
  const { count } = await prisma.seoAgentPage.updateMany({ where: { id, status: { in: ["DRAFT", "FLAGGED"] } }, data: { status: "DISCARDED" } })
  return count > 0
}

/** The admin list: newest first. */
export async function recentPages(limit = 60) {
  return prisma.seoAgentPage.findMany({ orderBy: { updatedAt: "desc" }, take: limit, select: { id: true, kind: true, slug: true, status: true, title: true, report: true, similarity: true, similarTo: true, noindex: true, error: true, attempts: true, autoPublished: true, publishedAt: true, createdAt: true } })
}

export type PublishedPageRow = { kind: SeoAgentPageKind; slug: string; data: Prisma.JsonValue; body: string; noindex: boolean; updatedAt: Date }

const PUBLISHED_PAGE = { kind: true, slug: true, data: true, body: true, noindex: true, updatedAt: true } as const

/** Published generated pages of some kinds, for public pages. Never throws: a page renders without them. */
export async function publishedPages(kinds: SeoAgentPageKind[]): Promise<PublishedPageRow[]> {
  return quietly("reading generated pages", [], () => prisma.seoAgentPage.findMany({ where: { status: "PUBLISHED", kind: { in: kinds } }, orderBy: { publishedAt: "asc" }, select: PUBLISHED_PAGE }))
}

export async function publishedPage(kind: SeoAgentPageKind, slug: string): Promise<PublishedPageRow | null> {
  return quietly("reading a generated page", null, () => prisma.seoAgentPage.findFirst({ where: { kind, slug, status: "PUBLISHED" }, select: PUBLISHED_PAGE }))
}
