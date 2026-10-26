/**
 * The `state` of an OAuth connection Salsox starts as a client (HubSpot,
 * Salesforce), as pure functions. Tested in oauth-state.test.ts.
 *
 * A callback is only trusted when it carries a state Salsox signed, for the
 * person whose session receives it, in the same browser, within ten minutes:
 *
 * - The state is `<payload>.<signature>`: base64url JSON (provider, user id,
 *   nonce, expiry, and anything the provider's flow needs, such as "sandbox")
 *   signed with HMAC-SHA256 under a key derived from AUTH_SECRET. A forged
 *   or edited state fails the signature.
 * - The nonce is also set in an httpOnly cookie when the flow starts, and
 *   must match at the callback: a link to someone else's callback, opened in
 *   another browser, carries a state that browser never started.
 * - The user id must be the callback's signed-in user: one person's flow
 *   cannot finish into another account.
 *
 * The cookie also carries a PKCE verifier where the provider takes one
 * (Salesforce): it never appears in a URL.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export const STATE_TTL_MS = 10 * 60_000
export const STATE_COOKIE = "sx_oauth"

export type StatePayload = { p: string; u: string; n: string; e: number; x?: Record<string, string | boolean> }

function key(secret: string): Buffer {
  return createHash("sha256").update(`integration-oauth-state:${secret}`).digest()
}

const sign = (data: string, secret: string) => createHmac("sha256", key(secret)).update(data).digest("base64url")

/** A new state for `provider` and `userId`, with its nonce (for the cookie). */
export function createState(input: { provider: string; userId: string; secret: string; now?: number; extra?: Record<string, string | boolean>; nonce?: string }): { state: string; nonce: string } {
  const nonce = input.nonce ?? randomBytes(16).toString("base64url")
  const payload: StatePayload = { p: input.provider, u: input.userId, n: nonce, e: (input.now ?? Date.now()) + STATE_TTL_MS, ...(input.extra ? { x: input.extra } : {}) }
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return { state: `${data}.${sign(data, input.secret)}`, nonce }
}

export type StateCheck = { ok: true; payload: StatePayload } | { ok: false; reason: "malformed" | "signature" | "expired" | "provider" | "user" | "browser" }

/** Whether a callback's state is one this flow issued, for this user, in this browser, in time. */
export function checkState(input: { state: unknown; provider: string; userId: string; cookieNonce: string | null | undefined; secret: string; now?: number }): StateCheck {
  if (typeof input.state !== "string" || input.state.length > 2048) return { ok: false, reason: "malformed" }
  const [data, signature, rest] = input.state.split(".")
  if (!data || !signature || rest !== undefined) return { ok: false, reason: "malformed" }
  const expected = Buffer.from(sign(data, input.secret))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return { ok: false, reason: "signature" }
  let payload: StatePayload
  try {
    payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"))
  } catch {
    return { ok: false, reason: "malformed" }
  }
  if (payload.e < (input.now ?? Date.now())) return { ok: false, reason: "expired" }
  if (payload.p !== input.provider) return { ok: false, reason: "provider" }
  if (payload.u !== input.userId) return { ok: false, reason: "user" }
  if (!input.cookieNonce || input.cookieNonce !== payload.n) return { ok: false, reason: "browser" }
  return { ok: true, payload }
}

/** The cookie value: the nonce, and a PKCE verifier when there is one. */
export function stateCookieValue(nonce: string, verifier?: string): string {
  return verifier ? `${nonce}.${verifier}` : nonce
}

export function readStateCookie(value: string | null | undefined): { nonce: string | null; verifier: string | null } {
  const [nonce, verifier] = (value ?? "").split(".")
  return { nonce: nonce || null, verifier: verifier || null }
}

/** A PKCE pair (RFC 7636, S256). */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url")
  return { verifier, challenge: pkceChallenge(verifier) }
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}
