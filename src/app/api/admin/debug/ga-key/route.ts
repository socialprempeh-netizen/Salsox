import { getAdminUser } from "@/lib/auth"
import { diagnoseServiceAccountKey } from "@/lib/admin/key-diagnostics"

/**
 * TEMPORARY, admin-only. Reports the shape of GA_SERVICE_ACCOUNT_KEY_BASE64
 * as the running deployment sees it (present, length, valid base64, decodes
 * to JSON, has private_key), to tell a corrupted or truncated paste in Vercel
 * from a wrong key. Never returns any part of the value. Delete this route
 * and src/lib/admin/key-diagnostics.ts once the key works.
 */
export const dynamic = "force-dynamic"

export async function GET() {
  // Was getCurrentUser(): admins also need 2FA, passed on this session
  // (src/lib/two-factor-policy.ts), so a role alone no longer opens this.
  const user = await getAdminUser()
  if (!user || user.role !== "ADMIN") {
    return new Response("Forbidden", { status: 403 })
  }

  return Response.json(
    { variable: "GA_SERVICE_ACCOUNT_KEY_BASE64", vercelEnv: process.env.VERCEL_ENV ?? null, ...diagnoseServiceAccountKey(process.env.GA_SERVICE_ACCOUNT_KEY_BASE64) },
    { headers: { "Cache-Control": "no-store" } }
  )
}
