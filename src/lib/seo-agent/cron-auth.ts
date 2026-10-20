/**
 * The check every SEO agent cron route makes before running: CRON_SECRET must
 * be set, and the request must carry it as a bearer token (Vercel sends it on
 * scheduled invocations). With the variable unset the routes refuse rather
 * than run open, the same rule as /api/cron/esign.
 */
export function cronRefusal(request: Request, secret = process.env.CRON_SECRET): { error: string; status: number } | null {
  if (!secret) return { error: "CRON_SECRET is not set: refusing to run unauthenticated.", status: 500 }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return { error: "Unauthorized", status: 401 }
  return null
}
