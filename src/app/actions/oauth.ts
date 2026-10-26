"use server"

/**
 * The OAuth consent page's actions (/oauth/authorize): Allow makes a
 * one-time code and says where to send the browser; Cancel sends it back
 * with access_denied. Both re-check the whole request and the session, as
 * an action can be called on its own (src/lib/oauth-server/rules.ts has the
 * rules). Also "Disconnect" for a connected app on the Developers page.
 */
import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/auth"
import { mustEnrollBeforeUse } from "@/lib/security-enrollment"
import { checkRateLimit } from "@/lib/rate-limit"
import { authorizeRedirect, checkAuthorizeRequest, oauthClients } from "@/lib/oauth-server/rules"
import { issueCode, revokeGrant } from "@/lib/oauth-server/store"

export type ConsentResult = { ok: true; url: string } | { ok: false; error: "invalid" | "signedOut" | "rate" }

function check(params: unknown) {
  if (!params || typeof params !== "object") return null
  const clean = Object.fromEntries(Object.entries(params as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 2048) : undefined]))
  const checked = checkAuthorizeRequest(clean, oauthClients())
  return checked.ok ? checked.request : null
}

export async function approveOAuthAction(params: unknown): Promise<ConsentResult> {
  const request = check(params)
  if (!request) return { ok: false, error: "invalid" }
  const user = await getCurrentUser()
  if (!user || (await mustEnrollBeforeUse(user))) return { ok: false, error: "signedOut" }
  if (!(await checkRateLimit(`oauth-consent:${user.id}`, 20))) return { ok: false, error: "rate" }
  const code = await issueCode(user.id, request)
  return { ok: true, url: authorizeRedirect(request.redirectUri, { code }, request.state) }
}

export async function denyOAuthAction(params: unknown): Promise<ConsentResult> {
  const request = check(params)
  if (!request) return { ok: false, error: "invalid" }
  return { ok: true, url: authorizeRedirect(request.redirectUri, { error: "access_denied" }, request.state) }
}

/** Ends a connected app's access: every token of the grant stops working at once. */
export async function revokeOAuthGrantAction(grantId: unknown): Promise<{ ok: boolean }> {
  const user = await getCurrentUser()
  if (!user || typeof grantId !== "string" || grantId.length > 64) return { ok: false }
  const ok = await revokeGrant(user.id, grantId)
  revalidatePath("/dashboard/developers")
  return { ok }
}
