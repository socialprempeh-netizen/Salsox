import { NextResponse } from "next/server"
import { runOutreach, runSocialDue } from "@/lib/outreach-agent/agent"
import { cronRefusal } from "@/lib/outreach-agent/cron-auth"
import { salsoxOutreach } from "@/lib/outreach-agent/site"

export const dynamic = "force-dynamic"
// Writing a short queue of emails and follow-ups and publishing due posts.
export const maxDuration = 300

/**
 * The outreach agent's daily run (src/lib/outreach-agent/agent.ts), wired to
 * a Vercel cron in vercel.json: publishes the social posts whose time has
 * come, then writes due follow-ups and first emails, sending them only when
 * the trust gate and the daily cap allow.
 *
 * Requires CRON_SECRET as a bearer token. The answer is each run's outcome in
 * plain words; nothing secret is ever in it.
 */
export async function GET(request: Request) {
  const refused = cronRefusal(request)
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })
  try {
    const social = await runSocialDue(salsoxOutreach, "cron")
    const outreach = await runOutreach(salsoxOutreach, "cron")
    return NextResponse.json({ ranAt: new Date().toISOString(), social, outreach })
  } catch (error) {
    // Only the run log's own writes can land here (the database is down).
    console.error("[cron/outreach-agent] run failed", error instanceof Error ? error.message : error)
    return NextResponse.json({ status: "failed", message: "The run could not be recorded." }, { status: 500 })
  }
}
