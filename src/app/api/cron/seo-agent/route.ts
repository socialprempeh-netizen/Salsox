import { NextResponse } from "next/server"
import { runDaily } from "@/lib/seo-agent/agent"
import { cronRefusal } from "@/lib/seo-agent/cron-auth"
import { runPageGeneration } from "@/lib/seo-agent/page-agent"
import { dailyMode } from "@/lib/seo-agent/policy"
import { salsoxPageSite, salsoxSite } from "@/lib/seo-agent/site"

export const dynamic = "force-dynamic"
// Reading Search Console, writing an article and, when it publishes itself,
// writing its link sentences: a few minutes at most.
export const maxDuration = 300

/** The schedule the article mode keeps; the page mode runs on all four. */
const PRIMARY_SCHEDULE = "0 5 * * *"

/**
 * The SEO agent's daily run, wired to a Vercel cron in vercel.json. It now
 * writes one template, comparison or law page (src/lib/seo-agent/page-agent.ts)
 * and saves it as a draft, flags it, or publishes it when the review rule
 * allows. The original run, a blog article for the best untargeted Search
 * Console query (agent.ts), is switched off by default and runs only with
 * SEO_AGENT_MODE=articles (policy.ts, dailyMode). Scheduled before the IndexNow cron, so an article
 * published here is submitted to search engines the same morning.
 *
 * It runs four times a day (vercel.json: 05:00, 11:00, 17:00 and 23:00 UTC,
 * each once a day, which the Hobby plan allows), and each page run writes a
 * small batch (page-agent.ts, pagesPerRun), so the page matrix
 * (page-matrix.ts) is built out a few pages at a time. The article mode, if
 * switched back on, still runs only at 05:00: it writes one article a day.
 *
 * Requires CRON_SECRET as a bearer token. The answer is the run's outcome in
 * plain words; nothing secret is ever in it.
 */
export async function GET(request: Request) {
  const refused = cronRefusal(request)
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })
  try {
    // Was the only mode: const result = await runDaily(salsoxSite, "cron")
    // Generic articles from Search Console gaps brought visits that did not
    // convert; templates, comparisons and law pages do, so they are the default.
    // Was: dailyMode() === "articles" ? runDaily(...) : runPageGeneration(...), on one daily schedule.
    const primary = (request.headers.get("x-vercel-cron-schedule") ?? PRIMARY_SCHEDULE) === PRIMARY_SCHEDULE
    if (dailyMode() === "articles" && !primary) return NextResponse.json({ ranAt: new Date().toISOString(), status: "skipped", message: "The article mode runs once a day, at 05:00 UTC." })
    const result = dailyMode() === "articles" ? await runDaily(salsoxSite, "cron") : await runPageGeneration(salsoxPageSite, "cron")
    return NextResponse.json({ ranAt: new Date().toISOString(), ...result })
  } catch (error) {
    // Only the run log's own writes can land here (the database is down).
    console.error("[cron/seo-agent] daily run failed", error)
    return NextResponse.json({ status: "failed", message: "The run could not be recorded." }, { status: 500 })
  }
}
