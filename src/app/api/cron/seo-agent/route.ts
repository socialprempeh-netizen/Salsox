import { NextResponse } from "next/server"
import { runDaily } from "@/lib/seo-agent/agent"
import { cronRefusal } from "@/lib/seo-agent/cron-auth"
import { salsoxSite } from "@/lib/seo-agent/site"

export const dynamic = "force-dynamic"
// Reading Search Console, writing an article and, when it publishes itself,
// writing its link sentences: a few minutes at most.
export const maxDuration = 300

/**
 * The SEO agent's daily run (src/lib/seo-agent/agent.ts), wired to a Vercel
 * cron in vercel.json: it picks the best untargeted Search Console query,
 * writes an article for it and saves it as a draft, or publishes it when the
 * review rule allows. Scheduled before the IndexNow cron, so an article
 * published here is submitted to search engines the same morning.
 *
 * Requires CRON_SECRET as a bearer token. The answer is the run's outcome in
 * plain words; nothing secret is ever in it.
 */
export async function GET(request: Request) {
  const refused = cronRefusal(request)
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })
  try {
    const result = await runDaily(salsoxSite, "cron")
    return NextResponse.json({ ranAt: new Date().toISOString(), ...result })
  } catch (error) {
    // Only the run log's own writes can land here (the database is down).
    console.error("[cron/seo-agent] daily run failed", error)
    return NextResponse.json({ status: "failed", message: "The run could not be recorded." }, { status: 500 })
  }
}
