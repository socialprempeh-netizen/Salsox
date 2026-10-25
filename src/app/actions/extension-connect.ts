"use server"

/**
 * The connect page's action (/extension/connect): the person confirmed, so
 * make an API key for the extension and say where to send the window.
 *
 * Re-checks everything the page checked, since an action can be called on
 * its own: a session, the redirect address against the allowlist
 * (src/lib/extension-connect.ts), the sign-in policy. The key is made by
 * createApiKey, exactly as on the Developers page, where it is listed by
 * name and can be revoked. It is returned in the redirect address's
 * fragment, once.
 */
import { getCurrentUser } from "@/lib/auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { createApiKey } from "@/lib/api-keys-store"
import { allowedExtensionIds, checkConnectRedirect, connectResult, EXTENSION_KEY_NAME } from "@/lib/extension-connect"
import { mustEnrollBeforeUse } from "@/lib/security-enrollment"

export type ConnectActionResult = { ok: true; url: string } | { ok: false; error: "invalid" | "rate" }

export async function connectExtensionAction(redirectUri: unknown): Promise<ConnectActionResult> {
  const redirect = checkConnectRedirect(redirectUri, allowedExtensionIds(process.env.SIGNING_EXTENSION_IDS), process.env.NODE_ENV === "development")
  if (!redirect) return { ok: false, error: "invalid" }
  const user = await getCurrentUser()
  if (!user) return { ok: true, url: connectResult(redirect, { error: "signed_out" }) }
  if (await mustEnrollBeforeUse(user)) return { ok: true, url: connectResult(redirect, { error: "setup_required" }) }
  if (!(await checkRateLimit(`extension-connect:${user.id}`, 10))) return { ok: false, error: "rate" }
  const created = await createApiKey(user.id, EXTENSION_KEY_NAME)
  if (!created.ok) return { ok: true, url: connectResult(redirect, { error: "limit" }) }
  return { ok: true, url: connectResult(redirect, { key: created.key }) }
}

/** "Cancel": the extension is told, so its popup can say so. */
export async function cancelExtensionConnectAction(redirectUri: unknown): Promise<ConnectActionResult> {
  const redirect = checkConnectRedirect(redirectUri, allowedExtensionIds(process.env.SIGNING_EXTENSION_IDS), process.env.NODE_ENV === "development")
  return redirect ? { ok: true, url: connectResult(redirect, { error: "cancelled" }) } : { ok: false, error: "invalid" }
}
