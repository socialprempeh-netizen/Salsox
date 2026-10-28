/**
 * AppSumo licenses, the side that talks to the database, AppSumo and Stripe
 * (the rules are in appsumo.ts):
 *
 * - applyAppSumoEvent: a verified webhook, written to the license row. A
 *   refund is a `deactivate`, after which the account's tier no longer counts
 *   the license: the plan gates read it live (accountTier in esign/sender.ts),
 *   so the downgrade needs no job of its own.
 * - redeemAppSumoLicense: links a key to the signed-in account, after checking
 *   it with AppSumo when the webhooks have not told us about it, and stops
 *   recurring billing the license now makes redundant.
 * - exchangeAppSumoCode: the OAuth step after activation, a one-time code
 *   turned into the buyer's key.
 * - licenseTierForUser / currentAppSumoLicense: what the account holds.
 *
 * The API key and tokens never reach a log or an error message: failures are
 * reported by HTTP status only.
 */
import { prisma } from "@/lib/prisma"
import { siteConfig } from "@/config/site"
import { tierCovers, tierForPlanSlug, type PlanTier } from "@/lib/esign/plans"
import { CHECKOUT_BLOCKING_STATUSES } from "@/lib/billing"
import {
  APPSUMO_TOKEN_URL,
  appSumoApiLicenseUrl,
  appSumoConfig,
  appSumoLicenseKeyUrl,
  appSumoRedirectUrl,
  appSumoTier,
  appSumoTokenBody,
  licenseChange,
  normalizeLicenseKey,
  readAppSumoAccessToken,
  readAppSumoLicense,
  redeemProblem,
  tierForLicense,
  type AppSumoEvent,
  type RedeemProblem,
} from "./appsumo"

const TIMEOUT_MS = 15_000

/**
 * Applies a verified, non-test webhook. "ignored" when the event changes
 * nothing (an add-on, a migrate, a late retry of an older event).
 */
export async function applyAppSumoEvent(event: AppSumoEvent): Promise<"applied" | "ignored"> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.appSumoLicense.findUnique({ where: { licenseKey: event.licenseKey } })
    const change = licenseChange(
      current && { licenseKey: current.licenseKey, tier: current.tier, status: current.status, userId: current.userId, lastEventAt: Number(current.lastEventAt) },
      event
    )
    if (!change) return "ignored"

    // The account a new key belongs to: the one it already has, or, for an
    // upgrade or downgrade, the one the replaced key was redeemed by.
    let userId = current?.userId ?? null
    if (!userId && change.inheritFrom) {
      const previous = await tx.appSumoLicense.findUnique({ where: { licenseKey: change.inheritFrom }, select: { userId: true } })
      userId = previous?.userId ?? null
    }

    const data = {
      tier: change.tier,
      status: change.status,
      userId,
      prevLicenseKey: event.prevLicenseKey ?? current?.prevLicenseKey ?? null,
      lastEvent: event.event,
      lastEventAt: BigInt(event.eventTimestamp),
      deactivatedReason: change.status === "DEACTIVATED" ? change.deactivatedReason : null,
    }
    await tx.appSumoLicense.upsert({ where: { licenseKey: event.licenseKey }, create: { licenseKey: event.licenseKey, ...data }, update: data })
    return "applied"
  })
}

/** The plan the account's AppSumo licenses grant now, or null. */
export async function licenseTierForUser(userId: string): Promise<Exclude<PlanTier, "free"> | null> {
  const licenses = await prisma.appSumoLicense.findMany({ where: { userId, status: "ACTIVE" }, select: { tier: true, status: true } })
  return appSumoTier(licenses)
}

/** The license to show on the account's pages: the active one, else the latest one. */
export async function currentAppSumoLicense(userId: string) {
  const select = { licenseKey: true, tier: true, status: true, redeemedAt: true, deactivatedReason: true, updatedAt: true } as const
  // Two reads rather than one sort: the enum's order (INACTIVE, ACTIVE,
  // DEACTIVATED) would put an inactive key ahead of the active one.
  return (
    (await prisma.appSumoLicense.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { tier: "desc" }, select })) ??
    (await prisma.appSumoLicense.findFirst({ where: { userId }, orderBy: { updatedAt: "desc" }, select }))
  )
}

/** What AppSumo says about a key, or null when it does not know it or cannot be asked. */
async function lookUpLicense(apiKey: string, licenseKey: string) {
  const res = await fetch(appSumoApiLicenseUrl(licenseKey), { headers: { "X-AppSumo-Licensing-Key": apiKey, accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`AppSumo license lookup answered ${res.status}`)
  const license = readAppSumoLicense(await res.json())
  return license && license.licenseKey === licenseKey ? license : null
}

/** AppSumo's `error` field from an answer body, for the log: a short code such as "invalid_grant", never a credential. */
async function errorCodeOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as Record<string, unknown>
    return typeof body?.error === "string" && body.error ? body.error.slice(0, 60) : "none"
  } catch {
    return "unreadable body"
  }
}

/**
 * The one-time OAuth code from /redeem, exchanged for the buyer's key. Null
 * when AppSumo refuses it. Every way this can fail is logged by step and
 * status, never with the code, the token or the client values: each of them
 * used to return null silently, which left nothing to diagnose from.
 */
export async function exchangeAppSumoCode(code: string): Promise<string | null> {
  const config = appSumoConfig()
  if (!config?.oauth) {
    console.error("[appsumo] code arrived, but the OAuth client is not configured")
    return null
  }
  // Any printable code within reason: AppSumo documents no format for it, and
  // the earlier check (8 to 200 of [A-Za-z0-9._~-]) refused codes silently.
  if (!/^[\x21-\x7e]{4,512}$/.test(code)) {
    console.error(`[appsumo] code refused before the exchange: ${code.length} characters, not printable ASCII`)
    return null
  }
  const tokenRes = await fetch(APPSUMO_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(appSumoTokenBody({ ...config.oauth, code, redirectUri: appSumoRedirectUrl(siteConfig.url) })),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!tokenRes.ok) {
    console.error(`[appsumo] code exchange answered ${tokenRes.status}, error: ${await errorCodeOf(tokenRes)}`)
    return null
  }
  let tokenBody: unknown = null
  try {
    tokenBody = await tokenRes.json()
  } catch {
    console.error("[appsumo] code exchange answered 200 with a body that is not JSON")
    return null
  }
  const accessToken = readAppSumoAccessToken(tokenBody)
  if (!accessToken) {
    const err = tokenBody && typeof tokenBody === "object" ? (tokenBody as Record<string, unknown>).error : undefined
    console.error(`[appsumo] code exchange answered 200 without an access token, error: ${typeof err === "string" && err ? err.slice(0, 60) : "none"}`)
    return null
  }
  console.info("[appsumo] code exchanged for an access token")
  const licenseRes = await fetch(appSumoLicenseKeyUrl(accessToken), { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!licenseRes.ok) {
    console.error(`[appsumo] license read answered ${licenseRes.status}, error: ${await errorCodeOf(licenseRes)}`)
    return null
  }
  let license = null
  try {
    license = readAppSumoLicense(await licenseRes.json())
  } catch {
    // Read below as "not a license answer".
  }
  if (!license) {
    console.error("[appsumo] license read answered 200 without a license key and status this app recognises")
    return null
  }
  console.info(`[appsumo] license read: status ${license.status}`)
  return license.licenseKey
}

export type RedeemResult =
  | { ok: true; tier: Exclude<PlanTier, "free">; stoppedSubscription: boolean }
  | { ok: false; problem: RedeemProblem }

/**
 * Links a license key to `userId`. The webhook row is trusted when it says
 * the key is active; otherwise AppSumo is asked, since an activation can land
 * here before its webhook does, or the webhook can have failed.
 */
export async function redeemAppSumoLicense(userId: string, rawKey: unknown, now = new Date()): Promise<RedeemResult> {
  const licenseKey = normalizeLicenseKey(rawKey)
  if (!licenseKey) return { ok: false, problem: "invalidKey" }
  const config = appSumoConfig()
  if (!config) return { ok: false, problem: "unavailable" }

  let row = await prisma.appSumoLicense.findUnique({ where: { licenseKey } })
  if (!row || row.status !== "ACTIVE") {
    let remote
    try {
      remote = await lookUpLicense(config.apiKey, licenseKey)
    } catch (error) {
      console.error("[appsumo] license lookup failed", error instanceof Error ? error.message : "unknown error")
      if (!row) return { ok: false, problem: "unavailable" }
    }
    if (remote) {
      // Recorded as of now, so any webhook that follows still applies over it.
      const data = { status: remote.status, tier: remote.tier ?? row?.tier ?? 1, lastEvent: "lookup", lastEventAt: BigInt(row ? Number(row.lastEventAt) : 0) }
      row = await prisma.appSumoLicense.upsert({ where: { licenseKey }, create: { licenseKey, ...data }, update: data })
    }
  }

  const other = await prisma.appSumoLicense.findFirst({ where: { userId, status: "ACTIVE", licenseKey: { not: licenseKey } }, select: { licenseKey: true } })
  const problem = redeemProblem(row, userId, other?.licenseKey ?? null)
  if (problem || !row) return { ok: false, problem: problem ?? "notFound" }

  // Claimed only while still unclaimed (or already ours), so two accounts
  // racing for one key cannot both win.
  const claimed = await prisma.appSumoLicense.updateMany({
    where: { licenseKey, OR: [{ userId: null }, { userId }] },
    data: { userId, redeemedAt: row.redeemedAt ?? now },
  })
  if (claimed.count === 0) return { ok: false, problem: "takenByOther" }

  const tier = tierForLicense(row.tier)
  return { ok: true, tier, stoppedSubscription: await stopRedundantSubscription(userId, tier) }
}

/**
 * A lifetime license means no recurring billing: a live subscription the
 * license covers is set to end with the period already paid for, the same
 * way the billing page's own Cancel button does it (actions/billing.ts). A
 * subscription to a higher plan than the license is left alone, since ending
 * it would take features away. True when one was stopped.
 */
async function stopRedundantSubscription(userId: string, tier: Exclude<PlanTier, "free">): Promise<boolean> {
  const subscription = await prisma.subscription.findUnique({ where: { userId }, include: { plan: { select: { slug: true } } } })
  if (!subscription || subscription.cancelAtPeriodEnd) return false
  if (!(CHECKOUT_BLOCKING_STATUSES as readonly string[]).includes(subscription.status)) return false
  if (!tierCovers(tier, tierForPlanSlug(subscription.plan.slug))) return false
  if (!process.env.STRIPE_SECRET_KEY) return false
  try {
    const { stripe } = await import("@/lib/stripe")
    await stripe.subscriptions.update(subscription.stripeSubscriptionId, { cancel_at_period_end: true })
  } catch (error) {
    console.error("[appsumo] could not stop the redundant subscription", error instanceof Error ? error.message : "unknown error")
    return false
  }
  await prisma.subscription.update({ where: { id: subscription.id }, data: { cancelAtPeriodEnd: true } })
  return true
}
