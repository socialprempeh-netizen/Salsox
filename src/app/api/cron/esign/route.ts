import { NextResponse } from "next/server"
import { expireSweep, recoverStuckFinalizations, reminderSweep } from "@/lib/esign/documents"
import { renewalNoticeSweep } from "@/lib/esign/renewal"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Scheduled e-signature housekeeping, wired to a Vercel cron in vercel.json
 * (daily, which every Vercel plan allows; hourly is fine on Pro). Expiry is
 * also enforced live by the signing page, so the schedule only affects when
 * owners are notified, never whether an expired link still works.
 *
 *  - expire:   PENDING documents whose unsigned links lapsed become EXPIRED,
 *              and the owner is told (with a one-click renew link).
 *  - remind:   recipients who have not signed get a nudge every 3 days.
 *  - finalize: documents whose last signature went through but whose sealing
 *              did not (a failure mid-finalization) are finished. Was
 *              "reseal", which only retried COMPLETED documents.
 *  - renewals: subscriptions renewing soon get an advance notice, because
 *              Salsox never renews silently.
 *
 * Each step is independent and idempotent, so one failing does not stop the
 * others, and a re-run the same day does nothing twice. Requires CRON_SECRET,
 * which Vercel sends as a bearer token on scheduled invocations; with the
 * variable unset the route refuses rather than running open.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set: refusing to run unauthenticated." }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // const steps = { expire: expireSweep, remind: reminderSweep, reseal: resealSweep, renewals: renewalNoticeSweep }
  const steps = { expire: expireSweep, remind: reminderSweep, finalize: () => recoverStuckFinalizations(), renewals: renewalNoticeSweep }
  const results: Record<string, number | string> = {}
  for (const [name, run] of Object.entries(steps)) {
    try {
      results[name] = await run()
    } catch (error) {
      console.error(`[cron/esign] ${name} failed`, error)
      results[name] = "failed"
    }
  }
  return NextResponse.json({ status: "ok", ranAt: new Date().toISOString(), ...results })
}
