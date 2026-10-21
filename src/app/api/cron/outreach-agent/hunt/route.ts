import { NextResponse } from "next/server"
import { runHunt } from "@/lib/outreach-agent/agent"
import { cronRefusal } from "@/lib/outreach-agent/cron-auth"
import { salsoxOutreach } from "@/lib/outreach-agent/site"

export const dynamic = "force-dynamic"
// Crawling about a dozen review pages and reading each one: a few minutes.
export const maxDuration = 300

/**
 * The outreach agent's hunt (Hunter), twice a week by a Vercel cron in
 * vercel.json: competitors' low-rated reviews and Reddit posts asking for an
 * alternative, kept as leads when the quote is real and a fix exists. Review
 * sites change slowly, so twice a week finds what is new without hammering
 * them.
 *
 * Requires CRON_SECRET as a bearer token; the answer is the outcome in plain
 * words, never a secret.
 */
export async function GET(request: Request) {
  const refused = cronRefusal(request)
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })
  try {
    return NextResponse.json({ ranAt: new Date().toISOString(), ...(await runHunt(salsoxOutreach, "cron")) })
  } catch (error) {
    console.error("[cron/outreach-agent/hunt] run failed", error instanceof Error ? error.message : error)
    return NextResponse.json({ status: "failed", message: "The run could not be recorded." }, { status: 500 })
  }
}
