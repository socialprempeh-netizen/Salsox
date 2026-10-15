/**
 * IndexNow's memory: which URLs search engines have already been told about,
 * the submissions sent with what the endpoint answered, and which production
 * deployments have run their deploy-time sync.
 *
 * Why it exists: without it, "pinged on publish" could only be taken on
 * trust. Every submission is logged here and shown on /admin/seo/inventory,
 * and the diff against the last accepted version of each URL is what makes a
 * sync safe to run as often as it is triggered: a URL is sent when it is new
 * or its sitemap date moved, never twice for the same change.
 *
 * The decisions (key, payloads, which URLs are pending) are pure functions in
 * src/lib/indexnow.ts; this file only reads and writes the database around
 * them. Nothing here throws to its caller: a failed ping is logged (console
 * and table) and the site carries on.
 */
import sitemap from "@/app/sitemap"
import { siteConfig } from "@/config/site"
import { prisma } from "@/lib/prisma"
import { isAcceptedStatus, normalizeUrls, pendingUrls, resolveIndexNowKey, submitToIndexNow } from "@/lib/indexnow"

export type IndexNowTrigger = "deploy" | "cron" | "manual"

/** How many URLs of a submission the log keeps; `urlCount` has the total. */
const LOGGED_URLS = 50

export type SyncResult =
  | { status: "skipped"; reason: string }
  | { status: "sent"; submitted: number; statuses: number[]; ok: boolean }
  | { status: "nothing"; submitted: 0 }

/** Why this deployment must not submit anything, or null when it may. */
export function skipReason(): string | null {
  if (process.env.DEMO_MODE === "true") return "demo deployment: noindex, nothing to submit"
  if (!/^https:\/\//.test(siteConfig.url)) return `site URL ${siteConfig.url} is not a public https origin`
  if (!resolveIndexNowKey(process.env)) return "IndexNow is off: set INDEXNOW_KEY or CRON_SECRET"
  return null
}

/**
 * Claims the deploy-time sync for one deployment. True for the first caller
 * only: the primary key turns concurrent claims from several fresh instances
 * into one winner.
 */
export async function claimDeployment(id: string): Promise<boolean> {
  try {
    await prisma.indexNowDeploy.create({ data: { id } })
    return true
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false
    throw error
  }
}

/**
 * Submits `urls` and records the outcome, one log row per request. On an
 * accepted request each URL's state is stored, so the next sync skips it
 * until it changes.
 */
export async function submitAndRecord(trigger: IndexNowTrigger, urls: { url: string; lastModified: Date | null }[]): Promise<SyncResult> {
  const skipped = skipReason()
  if (skipped) return { status: "skipped", reason: skipped }
  // Each entry made absolute (or dropped when it is not on this host), so the
  // URL stored as accepted is the one that was sent.
  const entries = new Map<string, Date | null>()
  for (const u of urls) {
    const [absolute] = normalizeUrls(siteConfig.url, [u.url])
    if (absolute && !entries.has(absolute)) entries.set(absolute, u.lastModified)
  }
  const list = [...entries.keys()]
  if (list.length === 0) return { status: "nothing", submitted: 0 }

  let statuses: number[] = []
  let error: string | null = null
  try {
    statuses = (await submitToIndexNow(siteConfig.url, resolveIndexNowKey(process.env)!, list)).statuses
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 300) : "request failed"
    statuses = [0]
  }
  const ok = statuses.length > 0 && statuses.every(isAcceptedStatus)
  if (!ok) console.error(`[indexnow] ${trigger} submission not accepted`, { statuses, error })

  try {
    await prisma.indexNowPing.create({
      data: { trigger, urlCount: list.length, urls: list.slice(0, LOGGED_URLS), status: statuses.find((s) => !isAcceptedStatus(s)) ?? statuses[0], ok, error },
    })
    if (ok) {
      const now = new Date()
      await prisma.$transaction(
        [...entries].map(([url, lastModified]) =>
          prisma.indexNowUrl.upsert({
            where: { url },
            create: { url, lastModified, submittedAt: now },
            update: { lastModified, submittedAt: now },
          })
        )
      )
    }
  } catch (e) {
    console.error("[indexnow] could not record the submission", e)
  }
  return { status: "sent", submitted: list.length, statuses, ok }
}

/** Submits every sitemap URL that is new or changed since it was last accepted. */
export async function syncIndexNow(trigger: IndexNowTrigger): Promise<SyncResult> {
  const skipped = skipReason()
  if (skipped) return { status: "skipped", reason: skipped }
  const known = await prisma.indexNowUrl.findMany({ select: { url: true, lastModified: true } })
  const pending = pendingUrls(sitemap(), new Map(known.map((k) => [k.url, k.lastModified])))
  return submitAndRecord(trigger, pending)
}

export type IndexNowPingRow = {
  id: string
  createdAt: string
  trigger: string
  urlCount: number
  urls: string[]
  status: number
  ok: boolean
  error: string | null
}

/**
 * The latest submissions for the admin view, newest first, and how many URLs
 * have been accepted in all. Null when the tables are not there yet (the
 * migration has not been applied), so the page still renders.
 */
export async function indexNowLog(limit = 20): Promise<{ pings: IndexNowPingRow[]; acceptedUrls: number } | null> {
  try {
    const [pings, acceptedUrls] = await Promise.all([
      prisma.indexNowPing.findMany({ orderBy: { createdAt: "desc" }, take: limit }),
      prisma.indexNowUrl.count(),
    ])
    return { pings: pings.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })), acceptedUrls }
  } catch (error) {
    console.error("[indexnow] could not read the log", error)
    return null
  }
}
