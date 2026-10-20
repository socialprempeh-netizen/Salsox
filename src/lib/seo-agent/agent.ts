/**
 * The SEO agent's three jobs, end to end:
 *
 *  - runDaily: find the best untargeted Search Console opportunity, have
 *    Claude write an article for it, save it, and publish it straight away
 *    when the review rule allows (policy.ts), otherwise leave it as a draft;
 *  - publishArticle: put an article live and add one contextual link to it
 *    from two or three of the site's busiest pages;
 *  - runOrphanCrawl: crawl the site's sitemap and list pages nothing links to.
 *
 * Everything about the host site (its pages, its blog, its traffic, how its
 * cache is refreshed) comes through a SiteAdapter, so this file and the ones
 * it imports know nothing about the app around them. src/lib/seo-agent/site.ts
 * is this app's adapter.
 *
 * Every run is logged (store.ts) with a plain-language outcome. Failures are
 * caught and recorded, never thrown to the cron: a bad day must not take the
 * schedule down. Secrets never appear in a message.
 */
import { checkDraft, slugFor } from "./article"
import { pickUntargeted } from "./dedupe"
import { fetchSearchRows, fetchTopSearchPages, parseServiceAccountKey, searchWindow } from "./google"
import { bestParagraph, fallbackSentence, linksTo, paragraphs, pickLinkSources, validSentence } from "./links"
import { DEFAULT_RULES, rankOpportunities, type Opportunity, type OpportunityRules } from "./opportunities"
import { findOrphans, type CrawledPage } from "./orphans"
import { shouldAutoPublish } from "./policy"
import { chooseStyleReferences, type SitePath, type StyleReference } from "./prompt"
import * as store from "./store"
import { hasWriterKey, writeArticle, writeLinkSentences } from "./writer"

/** A page that can carry a link to a new article: its path, title and Markdown body. */
export type LinkablePage = { path: string; title: string; markdown: string }

export type SiteAdapter = {
  name: string
  url: string
  description: string
  /** What the product is and does: the only product facts an article may state. */
  productSummary: string
  /** The Search Console property, e.g. "https://example.com/" or "sc-domain:example.com". */
  searchConsoleSite: string
  /** Titles, headings and target keywords of every page that already exists. */
  coveredPhrases(): string[]
  /** Blog slugs already used by files, so an article never shadows one. */
  takenSlugs(): Set<string>
  categories(): string[]
  /** Pages an article may link to. */
  sitePaths(): Promise<SitePath[]>
  styleReferences(): StyleReference[]
  /** Pages whose Markdown can carry an injected link, by path. */
  linkablePages(): Map<string, LinkablePage>
  /** Paths by traffic, busiest first; throws when the source is not set up. */
  topPages(): Promise<string[]>
  /** Every page in the sitemap, fetched, with its internal links. */
  crawl(): Promise<CrawledPage[]>
  /** Refreshes cached pages after the blog or a page's links changed. */
  revalidate(paths: string[]): void
}

/** At most this many pages link to each new article. */
export const LINK_SOURCES = 3
/** How far down the traffic list to look for pages that can carry a link. */
const TOP_PAGES = 50

export function rulesFromEnv(site: Pick<SiteAdapter, "name">, env: Record<string, string | undefined> = process.env): OpportunityRules {
  const min = Number(env.SEO_AGENT_MIN_IMPRESSIONS)
  return {
    ...DEFAULT_RULES,
    minImpressions: Number.isFinite(min) && min > 0 ? Math.floor(min) : DEFAULT_RULES.minImpressions,
    brandTerms: [site.name.toLowerCase()],
  }
}

/** What is missing before the daily run can work, as setting names. */
export function missingSettings(env: Record<string, string | undefined> = process.env): string[] {
  const missing: string[] = []
  if (!parseServiceAccountKey(env.GA_SERVICE_ACCOUNT_KEY_BASE64)) missing.push("GA_SERVICE_ACCOUNT_KEY_BASE64")
  if (!env.ANTHROPIC_API_KEY?.trim()) missing.push("ANTHROPIC_API_KEY")
  return missing
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500)

export type DailyResult = { status: store.RunStatus; message: string; articleId?: string; published?: boolean }

export async function runDaily(site: SiteAdapter, trigger: store.RunTrigger): Promise<DailyResult> {
  const runId = await store.startRun("daily", trigger)
  if (!runId) return { status: "skipped", message: "Another daily run is in progress." }

  const finish = async (result: DailyResult & { candidates?: number; targetId?: string | null }) => {
    await store.finishRun(runId, { status: result.status === "running" ? "failed" : result.status, message: result.message, candidates: result.candidates, targetId: result.targetId })
    return result
  }

  const missing = missingSettings()
  if (missing.length) return finish({ status: "skipped", message: `Not configured: set ${missing.join(" and ")}.` })
  const key = parseServiceAccountKey(process.env.GA_SERVICE_ACCOUNT_KEY_BASE64)!

  // 1. Opportunities.
  let ranked: Opportunity[]
  try {
    const rows = await fetchSearchRows({ key, siteUrl: site.searchConsoleSite, ...searchWindow(new Date(), 90) })
    ranked = rankOpportunities(rows, rulesFromEnv(site))
  } catch (error) {
    return finish({ status: "failed", message: `Could not read Search Console: ${errorText(error)}` })
  }

  // 2. The best one nothing covers yet.
  const phrases = [...site.coveredPhrases(), ...(await store.targetKeywords()), ...(await store.articleTitles())]
  const pick = pickUntargeted(ranked, phrases)
  if (!pick) {
    return finish({ status: "skipped", candidates: ranked.length, message: ranked.length ? `All ${ranked.length} opportunities are already covered by existing pages or earlier targets.` : "No query met the thresholds (impressions, position 11-50, near-zero clicks)." })
  }
  const targetId = await store.createTarget(pick)
  if (!targetId) return finish({ status: "skipped", candidates: ranked.length, message: `"${pick.query}" was claimed by another run.` })

  // 3. The article.
  let savedId: string | null = null
  try {
    const categories = site.categories()
    const paths = await site.sitePaths()
    const brief = {
      siteName: site.name,
      productSummary: site.productSummary,
      keyword: pick.query,
      opportunity: pick,
      categories,
      paths,
      references: chooseStyleReferences(pick.query, site.styleReferences()),
    }
    const rules = { categories, allowedRelated: paths.map((p) => p.path) }
    let { draft, model } = await writeArticle(brief)
    let problems = checkDraft(draft, rules)
    if (problems.length) {
      // One second attempt, told exactly what was wrong.
      ;({ draft, model } = await writeArticle({ ...brief, feedback: problems }))
      problems = checkDraft(draft, rules)
    }
    if (problems.length) throw new Error(`The article did not pass its checks: ${problems.join("; ")}`)

    const slug = slugFor(pick.query, new Set([...site.takenSlugs(), ...(await store.articleSlugs())]))
    const writtenBefore = await store.countArticles()
    const articleId = await store.saveArticle({ targetId, slug, keyword: pick.query, model, ...draft })
    savedId = articleId

    // 4. Draft, or straight to the site.
    const { draftFirst } = await store.getSettings()
    if (shouldAutoPublish({ writtenBefore, draftFirst })) {
      const published = await publishArticle(site, articleId, { auto: true })
      return finish({ status: "ok", candidates: ranked.length, targetId, articleId, published: published.ok, message: `Wrote and published "${draft.title}" for "${pick.query}". ${published.message}` })
    }
    site.revalidate(["/admin/seo/agent"])
    return finish({ status: "ok", candidates: ranked.length, targetId, articleId, published: false, message: `Wrote a draft, "${draft.title}", for "${pick.query}". It is waiting for review.` })
  } catch (error) {
    if (savedId) {
      // The article exists; only publishing it failed. It stays a draft to publish by hand.
      await store.setTargetStatus(targetId, "DRAFT", { error: errorText(error) })
      site.revalidate(["/admin/seo/agent"])
      return finish({ status: "failed", candidates: ranked.length, targetId, articleId: savedId, message: `The article for "${pick.query}" was saved as a draft, but publishing it failed: ${errorText(error)}` })
    }
    await store.setTargetStatus(targetId, "FAILED", { error: errorText(error) })
    return finish({ status: "failed", candidates: ranked.length, targetId, message: `Writing for "${pick.query}" failed: ${errorText(error)}` })
  }
}

/** The busiest pages: Google Analytics first, Search Console clicks when GA is not set up. */
async function busiestPages(site: SiteAdapter): Promise<{ paths: string[]; source: string }> {
  try {
    return { paths: await site.topPages(), source: "Google Analytics" }
  } catch (gaError) {
    const key = parseServiceAccountKey(process.env.GA_SERVICE_ACCOUNT_KEY_BASE64)
    if (!key) throw gaError
    return { paths: await fetchTopSearchPages({ key, siteUrl: site.searchConsoleSite, ...searchWindow(new Date(), 28), limit: TOP_PAGES }), source: "Search Console (Google Analytics unavailable)" }
  }
}

/**
 * Publishes an article and links to it from up to three of the busiest pages
 * that can carry a link. A failure to add links does not stop the publish:
 * the article goes live and the message says what happened to the links.
 */
export async function publishArticle(site: SiteAdapter, articleId: string, { auto }: { auto: boolean }): Promise<{ ok: boolean; message: string }> {
  const article = await store.getArticle(articleId)
  if (!article) return { ok: false, message: "That article no longer exists." }
  if (article.target.status === "PUBLISHED") return { ok: true, message: "It was already published." }
  if (article.target.status === "DISCARDED") return { ok: false, message: "A discarded article cannot be published." }

  const href = `/blog/${article.slug}`
  const links: store.StoredLink[] = []
  let linkNote: string
  try {
    const { paths, source } = await busiestPages(site)
    const eligible = new Map([...site.linkablePages()].filter(([, page]) => !linksTo(page.markdown, href) && paragraphs(page.markdown).length > 0))
    const sources = pickLinkSources(paths, eligible, { exclude: href, limit: LINK_SOURCES })
    if (sources.length === 0) {
      linkNote = `No busy page from ${source} could carry a link.`
    } else {
      const prose = new Map(sources.map((s) => [s.path, paragraphs(s.markdown)]))
      let suggestions: Awaited<ReturnType<typeof writeLinkSentences>> = []
      if (hasWriterKey()) {
        try {
          suggestions = await writeLinkSentences({
            siteName: site.name,
            article: { title: article.title, description: article.description, href },
            sources: sources.map((s) => ({ path: s.path, title: s.title, paragraphs: prose.get(s.path)! })),
          })
        } catch (error) {
          console.error("[seo-agent] link sentences failed, using plain ones:", errorText(error))
        }
      }
      for (const s of sources) {
        const count = prose.get(s.path)!.length
        const suggestion = suggestions.find((x) => x.path === s.path)
        const usable = suggestion && validSentence(suggestion.sentence, href) && suggestion.afterParagraph >= 0 && suggestion.afterParagraph < count
        links.push(
          usable
            ? { sourcePath: s.path, afterParagraph: suggestion.afterParagraph, sentence: suggestion.sentence.trim() }
            : { sourcePath: s.path, afterParagraph: bestParagraph(prose.get(s.path)!, article.keyword), sentence: fallbackSentence(article.title, href) }
        )
      }
      linkNote = `Linked from ${links.map((l) => l.sourcePath).join(", ")} (busiest pages per ${source}).`
    }
  } catch (error) {
    linkNote = `No links were added: ${errorText(error)}`
  }

  await store.markPublished(articleId, { links, auto })
  site.revalidate([href, "/blog", ...links.map((l) => l.sourcePath), "/admin/seo/agent"])
  return { ok: true, message: linkNote }
}

export async function unpublishArticle(site: SiteAdapter, articleId: string): Promise<boolean> {
  const article = await store.getArticle(articleId)
  const result = await store.markUnpublished(articleId)
  if (!article || !result) return false
  site.revalidate([`/blog/${article.slug}`, "/blog", ...result.sources, "/admin/seo/agent"])
  return true
}

/** The weekly crawl: every sitemap page fetched, the ones with no link in listed. */
export async function runOrphanCrawl(site: SiteAdapter, trigger: store.RunTrigger): Promise<{ status: store.RunStatus; message: string }> {
  const runId = await store.startRun("orphans", trigger)
  if (!runId) return { status: "skipped", message: "Another crawl is in progress." }
  try {
    const pages = await site.crawl()
    if (pages.length === 0) throw new Error("the crawl fetched no pages")
    const orphans = findOrphans(pages)
    await store.replaceOrphans(orphans)
    const message = orphans.length ? `Crawled ${pages.length} pages; ${orphans.length} have no internal link pointing to them.` : `Crawled ${pages.length} pages; every page has at least one internal link in.`
    await store.finishRun(runId, { status: "ok", message, candidates: pages.length })
    site.revalidate(["/admin/seo/agent"])
    return { status: "ok", message }
  } catch (error) {
    const message = `The crawl failed: ${errorText(error)}`
    await store.finishRun(runId, { status: "failed", message })
    return { status: "failed", message }
  }
}
