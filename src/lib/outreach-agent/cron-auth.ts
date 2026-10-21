/**
 * The check every outreach agent cron route makes: CRON_SECRET must be set and
 * sent as a bearer token (Vercel does this on scheduled calls). With it unset
 * the routes refuse rather than run open. The same rule as the SEO agent's
 * (src/lib/seo-agent/cron-auth.ts), kept here so this module stands alone.
 */
export function cronRefusal(request: Request, secret = process.env.CRON_SECRET): { error: string; status: number } | null {
  if (!secret) return { error: "CRON_SECRET is not set: refusing to run unauthenticated.", status: 500 }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return { error: "Unauthorized", status: 401 }
  return null
}
