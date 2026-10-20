import { NextResponse } from "next/server"
import { z } from "zod"
import sitemap from "@/app/sitemap"
import { deployPingId } from "@/lib/indexnow"
import { claimDeployment, skipReason, submitAndRecord, syncIndexNow, type SyncResult } from "@/lib/indexnow-store"

export const dynamic = "force-dynamic"

/**
 * Pings IndexNow with what was published or updated, so search engines fetch
 * it now instead of on their next visit. The rules live in src/lib/indexnow.ts,
 * the memory of what was sent in src/lib/indexnow-store.ts.
 *
 * Content here ships with a deploy (templates, registry pages, posts and docs
 * are files), so "on publish" means "once the deploy is live". Three ways in:
 *
 *  - GET ?trigger=deploy, fired by the proxy (src/proxy.ts) in the background
 *    on the first request a production deployment serves. The deployment is
 *    claimed first, so of several instances starting together one submits.
 *  - GET, the Vercel cron in vercel.json, daily: the safety net for a deploy
 *    ping that never ran or was refused.
 *  - POST, by hand: `{ "urls": [...] }` with site paths or absolute URLs, or
 *    `{ "all": true }` for the whole sitemap.
 *
 * Deploy and cron submit what is new or changed since it was last accepted
 * (each sitemap URL against its stored lastModified), so a page is announced
 * once per change however often they run. Was: the cron submitted everything
 * whose lastModified fell in the last two days, which missed any change whose
 * run failed and resent unchanged pages on the next day.
 *
 * All three require CRON_SECRET as a bearer token, as the e-sign cron does.
 * The URLs come from the sitemap itself (POST excepted, which still passes
 * through the same host filter), so drafts, the dashboard and a demo
 * deployment can never be submitted. Every submission is logged and shown on
 * /admin/seo/inventory.
 */
// Was the two-day window of the scheduled run:
// const RECENT_MS = 2 * 24 * 60 * 60 * 1000

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

/** A sync result as a response: 502 when the engine refused the submission. */
function respond(result: SyncResult) {
  if (result.status === "sent") return NextResponse.json(result, { status: result.ok ? 200 : 502 })
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  const denied = authorize(request)
  if (denied) return denied

  try {
    if (new URL(request.url).searchParams.get("trigger") === "deploy") {
      const id = deployPingId(process.env)
      if (!id) return NextResponse.json({ status: "skipped", reason: "not a production deployment" })
      const skipped = skipReason()
      if (skipped) return NextResponse.json({ status: "skipped", reason: skipped })
      if (!(await claimDeployment(id))) return NextResponse.json({ status: "skipped", reason: "this deployment has already synced" })
      return respond(await syncIndexNow("deploy"))
    }
    return respond(await syncIndexNow("cron"))
  } catch (error) {
    console.error("[indexnow] sync failed", error)
    return NextResponse.json({ status: "failed" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const denied = authorize(request)
  if (denied) return denied

  const parsed = PostBody.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Send { "urls": [...] } or { "all": true }.' }, { status: 400 })
  }
  const entries = "all" in parsed.data ? await sitemap() : parsed.data.urls.map((url) => ({ url, lastModified: undefined }))
  return respond(await submitAndRecord("manual", entries.map((e) => ({ url: e.url, lastModified: e.lastModified ? new Date(e.lastModified) : null }))))
}
