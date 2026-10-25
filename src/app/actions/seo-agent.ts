"use server"

/**
 * Server actions behind the SEO agent tab (/admin/seo/agent): run the agent
 * or the crawl now, publish, discard or unpublish an article or a generated
 * page (the page mode, page-agent.ts), switch the publishing mode, and mark
 * an orphan page reviewed.
 *
 * Admin only, checked on every call: an action is a public endpoint whatever
 * page renders it. Every argument is re-parsed here, and the work itself is
 * done by src/lib/seo-agent, never re-implemented. Errors come back as keys
 * the page translates; run outcomes come back as the run log's own sentence.
 */
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { getAdminUser } from "@/lib/auth"
import { publishArticle, runDaily, runOrphanCrawl, unpublishArticle } from "@/lib/seo-agent/agent"
import { discardGeneratedPage, publishGeneratedPage, runPageGeneration, unpublishGeneratedPage } from "@/lib/seo-agent/page-agent"
import { dailyMode } from "@/lib/seo-agent/policy"
import { salsoxPageSite, salsoxSite } from "@/lib/seo-agent/site"
import { getArticle, markDiscarded, setDraftFirst, setOrphanStatus } from "@/lib/seo-agent/store"

export type SeoAgentResult = { ok: true; message?: string } | { ok: false; error: "notFound" | "invalid" | "failed"; message?: string }

const PATH = "/admin/seo/agent"
const id = z.string().min(1).max(64)

async function requireAdmin() {
  // Was getCurrentUser(): admins also need 2FA, passed on this session
  // (src/lib/two-factor-policy.ts), so a role alone no longer opens this.
  const user = await getAdminUser()
  if (!user || user.role !== "ADMIN") throw new Error("Unauthorized")
}

export async function runAgentNow(): Promise<SeoAgentResult> {
  await requireAdmin()
  // Was: const result = await runDaily(salsoxSite, "manual"). The article
  // mode is off unless SEO_AGENT_MODE=articles (policy.ts).
  const result = dailyMode() === "articles" ? await runDaily(salsoxSite, "manual") : await runPageGeneration(salsoxPageSite, "manual")
  revalidatePath(PATH)
  return result.status === "failed" ? { ok: false, error: "failed", message: result.message } : { ok: true, message: result.message }
}

export async function crawlNow(): Promise<SeoAgentResult> {
  await requireAdmin()
  const result = await runOrphanCrawl(salsoxSite, "manual")
  revalidatePath(PATH)
  return result.status === "failed" ? { ok: false, error: "failed", message: result.message } : { ok: true, message: result.message }
}

export async function publishDraft(articleId: string): Promise<SeoAgentResult> {
  await requireAdmin()
  if (!id.safeParse(articleId).success) return { ok: false, error: "invalid" }
  const result = await publishArticle(salsoxSite, articleId, { auto: false })
  revalidatePath(PATH)
  return result.ok ? { ok: true, message: result.message } : { ok: false, error: "notFound", message: result.message }
}

export async function discardDraft(articleId: string): Promise<SeoAgentResult> {
  await requireAdmin()
  if (!id.safeParse(articleId).success) return { ok: false, error: "invalid" }
  if (!(await markDiscarded(articleId))) return { ok: false, error: "notFound" }
  revalidatePath(PATH)
  return { ok: true }
}

export async function unpublish(articleId: string): Promise<SeoAgentResult> {
  await requireAdmin()
  if (!id.safeParse(articleId).success) return { ok: false, error: "invalid" }
  if (!(await getArticle(articleId))) return { ok: false, error: "notFound" }
  if (!(await unpublishArticle(salsoxSite, articleId))) return { ok: false, error: "notFound" }
  revalidatePath(PATH)
  return { ok: true }
}

export async function setReviewEveryArticle(on: boolean): Promise<SeoAgentResult> {
  await requireAdmin()
  if (typeof on !== "boolean") return { ok: false, error: "invalid" }
  await setDraftFirst(on)
  revalidatePath(PATH)
  return { ok: true }
}

const orphanInput = z.object({ path: z.string().startsWith("/").max(512), status: z.enum(["OPEN", "REVIEWED"]) })

export async function setOrphanReview(path: string, status: "OPEN" | "REVIEWED"): Promise<SeoAgentResult> {
  await requireAdmin()
  const parsed = orphanInput.safeParse({ path, status })
  if (!parsed.success) return { ok: false, error: "invalid" }
  if (!(await setOrphanStatus(parsed.data.path, parsed.data.status))) return { ok: false, error: "notFound" }
  revalidatePath(PATH)
  return { ok: true }
}

export async function publishPage(pageId: string): Promise<SeoAgentResult> {
  await requireAdmin()
  if (!id.safeParse(pageId).success) return { ok: false, error: "invalid" }
  const result = await publishGeneratedPage(salsoxPageSite, pageId, { auto: false })
  revalidatePath(PATH)
  return result.ok ? { ok: true, message: result.message } : { ok: false, error: "notFound", message: result.message }
}

export async function discardPage(pageId: string): Promise<SeoAgentResult> {
  await requireAdmin()
  if (!id.safeParse(pageId).success) return { ok: false, error: "invalid" }
  if (!(await discardGeneratedPage(salsoxPageSite, pageId))) return { ok: false, error: "notFound" }
  revalidatePath(PATH)
  return { ok: true }
}

export async function unpublishPage(pageId: string): Promise<SeoAgentResult> {
  await requireAdmin()
  if (!id.safeParse(pageId).success) return { ok: false, error: "invalid" }
  if (!(await unpublishGeneratedPage(salsoxPageSite, pageId))) return { ok: false, error: "notFound" }
  revalidatePath(PATH)
  return { ok: true }
}
