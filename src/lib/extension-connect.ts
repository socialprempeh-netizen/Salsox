/**
 * Connecting a browser extension to an account (the "Salsox Signing" Chrome
 * extension, extensions/salsox-signing), the part that can be stated as
 * functions.
 *
 * The extension signs in with Chrome's launchWebAuthFlow: it opens
 * /extension/connect?redirect_uri=https://<extension id>.chromiumapp.org/…
 * in a window that shares the browser's session. The person confirms, an API
 * key is made for them (the same kind the Developers page makes), and the
 * page sends the window to the redirect address with the key in the
 * fragment. Chrome catches any navigation to <id>.chromiumapp.org and hands
 * it to that extension alone, so the key never goes over the network and no
 * other extension can receive it.
 *
 * Which extension is allowed to receive a key is the one rule that matters:
 * any extension can open this page with its own redirect address. So the
 * extension ids are an allowlist (SIGNING_EXTENSION_IDS, comma-separated),
 * and only in development is any id accepted, so an unpacked copy can be
 * tried locally before its store id is known.
 */

/** A Chrome extension id: 32 letters from a to p. */
const EXTENSION_ID = /^[a-p]{32}$/

/** What the connect page sends back besides a key. */
export type ConnectError = "signed_out" | "setup_required" | "cancelled" | "limit"

/** The extension id a launchWebAuthFlow redirect address belongs to, or null for any other address. */
export function extensionIdFromRedirect(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 300) return null
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null
  const match = /^([a-p]{32})\.chromiumapp\.org$/.exec(url.hostname)
  return match && EXTENSION_ID.test(match[1]) ? match[1] : null
}

/** The allowlist, from SIGNING_EXTENSION_IDS: ids separated by commas or spaces; anything else ignored. */
export function allowedExtensionIds(raw: string | undefined): string[] {
  return (raw ?? "").split(/[\s,]+/).map((s) => s.trim()).filter((s) => EXTENSION_ID.test(s))
}

/**
 * The redirect address, if it belongs to an extension that may connect, or
 * null. In development any extension id passes; otherwise only listed ones.
 */
export function checkConnectRedirect(raw: unknown, allowed: string[], isDevelopment: boolean): string | null {
  const id = extensionIdFromRedirect(raw)
  if (!id) return null
  if (!isDevelopment && !allowed.includes(id)) return null
  return raw as string
}

/** The address the window goes to: the checked redirect, with the result in the fragment. */
export function connectResult(redirect: string, result: { key: string } | { error: ConnectError }): string {
  const params = new URLSearchParams("key" in result ? { key: result.key } : { error: result.error })
  return `${redirect}#${params.toString()}`
}

/** The name the key gets on the Developers page, where it can be revoked. */
export const EXTENSION_KEY_NAME = "Salsox Signing (Chrome extension)"
