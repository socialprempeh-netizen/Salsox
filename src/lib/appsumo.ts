/**
 * AppSumo lifetime deals, through AppSumo's Licensing API (v2), as pure
 * rules: configuration, the webhook signature, reading webhook events and
 * API answers, what a license grants, and whether an account may redeem one.
 * The database side is appsumo-store.ts; the routes are
 * /api/webhooks/appsumo (events), /redeem (where AppSumo sends a buyer after
 * activation) and /dashboard/redeem (where a signed-in user enters a key).
 * Tested in appsumo.test.ts, against the signature example AppSumo publishes.
 *
 * Why licensing and not codes: a codes deal is a CSV of strings AppSumo sells
 * and never mentions again, so nothing tells the app when one is refunded. A
 * licensing deal sends a signed webhook for every change to a license
 * (purchase, activate, upgrade, downgrade, deactivate), and a refund arrives
 * as `deactivate`, which is what lets a refunded buyer lose the plan.
 *
 * The contract, as documented at https://docs.licensing.appsumo.com (read
 * 2026-10-27):
 * - Webhooks carry `license_key` (a UUID), `event`, `license_status`, `tier`,
 *   `event_timestamp` (ms, changes on retries), `created_at`, `test`,
 *   `extra.reason`, and `prev_license_key` on upgrade and downgrade. Add-ons
 *   carry `parent_license_key`; this deal has none, so they are ignored.
 * - X-Appsumo-Signature is the hex HMAC-SHA256 of `${X-Appsumo-Timestamp}${raw
 *   body}`, keyed with the partner's API key.
 * - A webhook is answered 200 with `{ event, success: true }`. A license stays
 *   inactive on AppSumo's side until its `activate` webhook gets that answer.
 * - An upgrade or downgrade issues a NEW key and deactivates the old one in a
 *   separate webhook; their order is not promised.
 * - After activating, the buyer is sent to the OAuth redirect URL with a
 *   one-time `code`, exchanged at /openid/token/ for an access token that
 *   reads their key at /openid/license_key/.
 * - GET https://api.licensing.appsumo.com/v2/licenses/:key, with the API key
 *   in X-AppSumo-Licensing-Key, answers the key's `status` and `tier`.
 *
 * Tiers map onto the plans that exist (src/lib/esign/plans.ts): tier 1 is
 * Personal, tier 2 is Business. A Salsox account is one user, so a higher
 * tier unlocks features, never seats, and an account holds one license.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import type { PlanTier } from "@/lib/esign/plans"

export const APPSUMO_TOKEN_URL = "https://appsumo.com/openid/token/"
export const appSumoLicenseKeyUrl = (accessToken: string) => `https://appsumo.com/openid/license_key/?access_token=${encodeURIComponent(accessToken)}`
export const appSumoApiLicenseUrl = (licenseKey: string) => `https://api.licensing.appsumo.com/v2/licenses/${encodeURIComponent(licenseKey)}`

/**
 * A key entered before signing in waits in this httpOnly cookie, and the
 * dashboard layout redeems it on the first visit after sign-up or log-in
 * (components/appsumo/resume-pending.tsx), the way an OAuth consent is resumed.
 */
export const APPSUMO_PENDING_COOKIE = "sx_appsumo"
export const APPSUMO_PENDING_MINUTES = 60

/** Signed requests older or newer than this are refused, so a captured one cannot be replayed later. */
export const SIGNATURE_TOLERANCE_MS = 15 * 60_000

export type AppSumoConfig = {
  /** Signs webhooks and authorises API calls. */
  apiKey: string
  /** OAuth client, for reading a buyer's key after activation. Optional: without it buyers paste their key. */
  oauth: { clientId: string; clientSecret: string } | null
}

export function appSumoConfig(env: Record<string, string | undefined> = process.env): AppSumoConfig | null {
  const apiKey = env.APPSUMO_API_KEY?.trim()
  if (!apiKey) return null
  const clientId = env.APPSUMO_CLIENT_ID?.trim()
  const clientSecret = env.APPSUMO_CLIENT_SECRET?.trim()
  return { apiKey, oauth: clientId && clientSecret ? { clientId, clientSecret } : null }
}

/** The OAuth redirect URL registered with AppSumo: the public /redeem page. */
export function appSumoRedirectUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/redeem`
}

export function appSumoSignature(apiKey: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", apiKey).update(`${timestamp}${rawBody}`).digest("hex")
}

/**
 * Whether a webhook came from AppSumo: the signature matches, compared in
 * constant time, and the timestamp is within the tolerance of `now`.
 */
export function verifyAppSumoWebhook(input: {
  apiKey: string
  timestamp: string | null
  signature: string | null
  rawBody: string
  now: number
}): boolean {
  const { apiKey, timestamp, signature, rawBody, now } = input
  if (!timestamp || !signature || !/^\d{10,16}$/.test(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return false
  // Seconds or milliseconds: AppSumo's example is milliseconds, and reading a
  // seconds value as milliseconds would refuse every request as 1970.
  const ms = timestamp.length <= 10 ? Number(timestamp) * 1000 : Number(timestamp)
  if (Math.abs(now - ms) > SIGNATURE_TOLERANCE_MS) return false
  const expected = Buffer.from(appSumoSignature(apiKey, timestamp, rawBody), "hex")
  const given = Buffer.from(signature, "hex")
  return expected.length === given.length && timingSafeEqual(expected, given)
}

const LICENSE_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** A license key as AppSumo issues them, a UUID, lowercased; null for anything else. */
export function normalizeLicenseKey(value: unknown): string | null {
  if (typeof value !== "string") return null
  const key = value.trim().toLowerCase()
  return LICENSE_KEY.test(key) ? key : null
}

export const APPSUMO_EVENTS = ["purchase", "activate", "upgrade", "downgrade", "deactivate", "migrate"] as const
export type AppSumoEventName = (typeof APPSUMO_EVENTS)[number]

export type AppSumoEvent = {
  event: AppSumoEventName
  licenseKey: string
  prevLicenseKey: string | null
  tier: number
  /** Milliseconds. */
  eventTimestamp: number
  test: boolean
  reason: string | null
  /** Set on add-on licenses, which this deal does not sell. */
  parentLicenseKey: string | null
}

/**
 * A webhook body as an event, or null when it is not one. A test request
 * (`test: true`) may carry placeholder data, so only its event name is
 * required; the caller answers it without applying anything.
 */
export function readAppSumoEvent(body: unknown): AppSumoEvent | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const name = typeof b.event === "string" ? b.event.toLowerCase() : ""
  const event = APPSUMO_EVENTS.find((e) => e === name)
  const test = b.test === true
  if (!event) return null
  const licenseKey = normalizeLicenseKey(b.license_key)
  const tier = typeof b.tier === "number" && Number.isInteger(b.tier) && b.tier > 0 ? b.tier : null
  const eventTimestamp = typeof b.event_timestamp === "number" && Number.isFinite(b.event_timestamp) ? b.event_timestamp : null
  if (!test && (!licenseKey || eventTimestamp === null)) return null
  const extra = b.extra && typeof b.extra === "object" ? (b.extra as Record<string, unknown>) : {}
  return {
    event,
    licenseKey: licenseKey ?? "",
    prevLicenseKey: normalizeLicenseKey(b.prev_license_key),
    // AppSumo's own example of a purchase carries no tier: the first one.
    tier: tier ?? 1,
    eventTimestamp: eventTimestamp ?? 0,
    test,
    reason: typeof extra.reason === "string" ? extra.reason.slice(0, 200) : null,
    parentLicenseKey: normalizeLicenseKey(b.parent_license_key),
  }
}

export type LicenseStatus = "INACTIVE" | "ACTIVE" | "DEACTIVATED"

export type LicenseRow = {
  licenseKey: string
  tier: number
  status: LicenseStatus
  userId: string | null
  lastEventAt: number
}

/**
 * What an event does to a license row, or null when it changes nothing: an
 * add-on, a `migrate`, or an event older than the one already applied (a
 * retry delivered after a newer event). `inheritFrom` asks the store to copy
 * the account from the previous key, for an upgrade or downgrade.
 */
export function licenseChange(
  current: LicenseRow | null,
  event: AppSumoEvent
): { status: LicenseStatus; tier: number; inheritFrom: string | null; deactivatedReason: string | null } | null {
  if (event.parentLicenseKey || event.event === "migrate") return null
  if (current && current.lastEventAt > event.eventTimestamp) return null
  switch (event.event) {
    case "purchase":
      // A purchase never undoes an activation that arrived first.
      return { status: current?.status === "ACTIVE" ? "ACTIVE" : "INACTIVE", tier: event.tier, inheritFrom: null, deactivatedReason: null }
    case "activate":
      return { status: "ACTIVE", tier: event.tier, inheritFrom: null, deactivatedReason: null }
    case "upgrade":
    case "downgrade":
      // The new key replaces a key the buyer already activated: it is live at once.
      return { status: "ACTIVE", tier: event.tier, inheritFrom: event.prevLicenseKey, deactivatedReason: null }
    case "deactivate":
      return { status: "DEACTIVATED", tier: current?.tier ?? event.tier, inheritFrom: null, deactivatedReason: event.reason }
  }
}

/** The plan an AppSumo tier grants. */
export function tierForLicense(tier: number): Exclude<PlanTier, "free"> {
  return tier >= 2 ? "business" : "personal"
}

/** The plan an account's licenses grant: the highest active one, or null without one. */
export function appSumoTier(licenses: { tier: number; status: LicenseStatus }[]): Exclude<PlanTier, "free"> | null {
  const active = licenses.filter((l) => l.status === "ACTIVE")
  if (active.length === 0) return null
  return tierForLicense(Math.max(...active.map((l) => l.tier)))
}

export type RedeemProblem = "invalidKey" | "notFound" | "deactivated" | "notActivated" | "takenByOther" | "alreadyRedeemed" | "unavailable"

/**
 * Why `userId` may not redeem this license, or null when they may. Redeeming
 * the key the account already holds again is not a problem (null), so a
 * double submit is harmless. `otherActiveKey` is another active license the
 * account already holds.
 */
export function redeemProblem(
  license: { status: LicenseStatus; userId: string | null } | null,
  userId: string,
  otherActiveKey: string | null
): RedeemProblem | null {
  if (!license) return "notFound"
  if (license.status === "DEACTIVATED") return "deactivated"
  if (license.status !== "ACTIVE") return "notActivated"
  if (license.userId && license.userId !== userId) return "takenByOther"
  if (otherActiveKey) return "alreadyRedeemed"
  return null
}

/** A token answer from /openid/token/: the access token, or null when it is not one. */
export function readAppSumoAccessToken(body: unknown): string | null {
  if (!body || typeof body !== "object") return null
  const token = (body as Record<string, unknown>).access_token
  return typeof token === "string" && token.length > 0 ? token : null
}

/** The JSON body of the code exchange. AppSumo's examples send JSON, not a form. */
export function appSumoTokenBody(input: { clientId: string; clientSecret: string; code: string; redirectUri: string }) {
  return { client_id: input.clientId, client_secret: input.clientSecret, code: input.code, redirect_uri: input.redirectUri, grant_type: "authorization_code" }
}

/** A license answer (OAuth /openid/license_key/ or API /v2/licenses/:key), or null when it is not one. */
export function readAppSumoLicense(body: unknown): { licenseKey: string; status: LicenseStatus; tier: number | null } | null {
  if (!body || typeof body !== "object") return null
  const b = body as Record<string, unknown>
  const licenseKey = normalizeLicenseKey(b.license_key)
  const status = typeof b.status === "string" ? b.status.toUpperCase() : ""
  if (!licenseKey || !["INACTIVE", "ACTIVE", "DEACTIVATED"].includes(status)) return null
  const tier = typeof b.tier === "number" && Number.isInteger(b.tier) && b.tier > 0 ? b.tier : null
  return { licenseKey, status: status as LicenseStatus, tier }
}

/** The answer AppSumo expects for every webhook it should consider delivered. */
export function webhookSuccess(event: string, message?: string) {
  return message ? { event, success: true, message } : { event, success: true }
}
