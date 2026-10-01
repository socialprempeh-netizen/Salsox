import { NextResponse } from "next/server"
import { z } from "zod"
import sitemap from "@/app/sitemap"
import { siteConfig } from "@/config/site"
import { changedSince, resolveIndexNowKey, submitToIndexNow } from "@/lib/indexnow"

export const dynamic = "force-dynamic"

/**
 * Pings IndexNow with what was published or updated, so search engines fetch
 * it now instead of on their next visit. The rules live in src/lib/indexnow.ts.
 *
 * Content here ships with a deploy (posts, docs and the changelog are files),
 * so "on publish" means "once the deploy is live". Two ways in:
 *
 *  - GET, the Vercel cron in vercel.json, daily. Submits every sitemap URL
 *    whose `lastModified` falls in the last two days: a new or revised post,
 *    the blog index and category it lands in, the changelog after a release.
 *    Two days, not one, so a post dated the evening before the run is never
 *    missed; submitting a URL twice costs nothing.
 *  - POST, by hand or from a deploy hook, for anything else: `{ "urls": [...] }`
 *    with site paths or absolute URLs, or `{ "all": true }` for the whole
 *    sitemap (after a redesign, or the first time).
 *
 * Both require CRON_SECRET as a bearer token, as the e-sign cron does. The
 * source of URLs is the sitemap itself, so nothing that is kept out of it
 * (drafts, the dashboard, a demo deployment) can be submitted by the cron.
 */
const RECENT_MS = 2 * 24 * 60 * 60 * 1000

const PostBody = z.union([
  z.object({ all: z.literal(true) }),
  z.object({ urls: z.array(z.string().min(1).max(2048)).min(1).max(10_000) }),
])

function authorize(request: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set: refusing to run unauthenticated." }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return null
}

/** Why nothing should be sent from this deployment, or null when it may. */
function skipReason(): string | null {
  if (process.env.DEMO_MODE === "true") return "demo deployment: noindex, nothing to submit"
  if (!/^https:\/\//.test(siteConfig.url)) return `site URL ${siteConfig.url} is not a public https origin`
  if (!resolveIndexNowKey(process.env)) return "IndexNow is off: set INDEXNOW_KEY or CRON_SECRET"
  return null
}

async function submit(urls: string[]) {
  const skipped = skipReason()
  if (skipped) return NextResponse.json({ status: "skipped", reason: skipped, submitted: 0 })
  if (urls.length === 0) return NextResponse.json({ status: "ok", submitted: 0 })

  try {
    const result = await submitToIndexNow(siteConfig.url, resolveIndexNowKey(process.env)!, urls)
    const ok = result.statuses.every((s) => s === 200 || s === 202)
    if (!ok) console.error("[indexnow] submission refused", result.statuses)
    return NextResponse.json({ status: ok ? "ok" : "refused", ...result }, { status: ok ? 200 : 502 })
  } catch (error) {
    console.error("[indexnow] submission failed", error)
    return NextResponse.json({ status: "failed", submitted: 0 }, { status: 502 })
  }
}

export async function GET(request: Request) {
  const denied = authorize(request)
  if (denied) return denied
  return submit(changedSince(sitemap(), new Date(Date.now() - RECENT_MS)))
}

export async function POST(request: Request) {
  const denied = authorize(request)
  if (denied) return denied

  const parsed = PostBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Send { "urls": [...] } or { "all": true }.' }, { status: 400 })
  }
  return submit("all" in parsed.data ? sitemap().map((e) => e.url) : parsed.data.urls)
}
