import { NextResponse } from "next/server"
import { runOrphanCrawl } from "@/lib/seo-agent/agent"
import { cronRefusal } from "@/lib/seo-agent/cron-auth"
import { salsoxSite } from "@/lib/seo-agent/site"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * The SEO agent's weekly crawl, wired to a Vercel cron in vercel.json: every
 * sitemap page is fetched and its internal links read, and pages no other
 * page links to are listed on /admin/seo/agent for a person to fix. Nothing
 * on the site is changed by it.
 *
 * Requires CRON_SECRET as a bearer token.
 */
export async function GET(request: Request) {
  const refused = cronRefusal(request)
  if (refused) return NextResponse.json({ error: refused.error }, { status: refused.status })
  try {
    const result = await runOrphanCrawl(salsoxSite, "cron")
    return NextResponse.json({ ranAt: new Date().toISOString(), ...result })
  } catch (error) {
    console.error("[cron/seo-agent/orphans] crawl failed", error)
    return NextResponse.json({ status: "failed", message: "The crawl could not be recorded." }, { status: 500 })
  }
}
