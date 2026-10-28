"use server"

/**
 * Redeeming an AppSumo license (src/lib/appsumo.ts), from the public /redeem
 * page and from /dashboard/redeem.
 *
 * Signed in, a key is redeemed on the spot. Signed out, it is kept in an
 * httpOnly cookie and redeemed on the first dashboard visit after sign-up or
 * log-in (resumePendingRedemptionAction), so a buyer who arrives from AppSumo
 * without an account is never asked for the key twice.
 *
 * The key is re-read here whatever the form checked: the server decides.
 * Both actions are rate limited, since each miss can cost a call to AppSumo's
 * API, which allows 20 a minute for the whole site.
 */
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { getTranslations } from "next-intl/server"
import { getCurrentUser } from "@/lib/auth"
import { checkRateLimit, rateLimitKeyFromIp } from "@/lib/rate-limit"
import { APPSUMO_PENDING_COOKIE, APPSUMO_PENDING_MINUTES, normalizeLicenseKey } from "@/lib/appsumo"
import { redeemAppSumoLicense } from "@/lib/appsumo-store"

export type RedeemActionState =
  | { status: "redeemed"; tier: "personal" | "business"; stoppedSubscription: boolean }
  | { status: "saved" }
  | { status: "error"; message: string }

async function redeemOrKeep(licenseKey: string): Promise<RedeemActionState> {
  const t = await getTranslations("appsumo.errors")
  const user = await getCurrentUser()
  if (!user) {
    ;(await cookies()).set(APPSUMO_PENDING_COOKIE, licenseKey, {
      maxAge: APPSUMO_PENDING_MINUTES * 60,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    })
    return { status: "saved" }
  }
  if (!(await checkRateLimit(`appsumo:${user.id}`, 10))) return { status: "error", message: t("rate") }
  const result = await redeemAppSumoLicense(user.id, licenseKey)
  if (!result.ok) return { status: "error", message: t(`codes.${result.problem}`) }
  // Only when there is one: any cookie change in an action makes the client
  // refresh the page, with the same effect as the revalidatePath below.
  const store = await cookies()
  if (store.has(APPSUMO_PENDING_COOKIE)) store.delete(APPSUMO_PENDING_COOKIE)
  // No revalidatePath: it re-renders the page the form is on, and
  // /dashboard/redeem stops rendering the form once a license is active, which
  // took the success card with it. The dashboard is rendered per request, so
  // the next page shows the plan without it.
  return { status: "redeemed", tier: result.tier, stoppedSubscription: result.stoppedSubscription }
}

/** The key typed or pasted into the form. */
export async function redeemLicenseAction(input: { licenseKey: string }): Promise<RedeemActionState> {
  const t = await getTranslations("appsumo.errors")
  if (!(await checkRateLimit(await rateLimitKeyFromIp("appsumo"), 20))) return { status: "error", message: t("rate") }
  const licenseKey = normalizeLicenseKey(input?.licenseKey)
  if (!licenseKey) return { status: "error", message: t("codes.invalidKey") }
  return redeemOrKeep(licenseKey)
}

/**
 * The key kept from before sign-in, redeemed now that the visitor has an
 * account. Called once by the dashboard layout's ResumePendingRedemption
 * while the cookie exists; the cookie is cleared whatever the outcome, so a
 * refused key cannot loop. Answers the outcome /dashboard/redeem shows.
 */
export async function resumePendingRedemptionAction(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) return "none"
  const store = await cookies()
  const pending = store.get(APPSUMO_PENDING_COOKIE)?.value
  store.delete(APPSUMO_PENDING_COOKIE)
  if (!pending) return "none"
  try {
    const result = await redeemAppSumoLicense(user.id, pending)
    if (!result.ok) return result.problem
    revalidatePath("/dashboard", "layout")
    return result.stoppedSubscription ? "redeemed-stopped" : "redeemed"
  } catch (error) {
    console.error("[appsumo] pending redemption failed", error instanceof Error ? error.message : "unknown error")
    return "unavailable"
  }
}

// The one-time `code` AppSumo adds to /redeem, once exchanged by the panel
// after the page loaded. Replaced by the exchange in /redeem itself, on the
// server during that request: this one only ran in a browser that ran the
// page's script, and AppSumo's OAuth test, which fetches the URL from its
// server, never saw the code swapped for a token. Was:
// export async function exchangeCodeAction(code: string): Promise<RedeemActionState> {
//   const t = await getTranslations("appsumo.errors")
//   if (!(await checkRateLimit(await rateLimitKeyFromIp("appsumo-code"), 20))) return { status: "error", message: t("rate") }
//   let licenseKey: string | null = null
//   try {
//     licenseKey = typeof code === "string" ? await exchangeAppSumoCode(code) : null
//   } catch (error) {
//     console.error("[appsumo] code exchange failed", error instanceof Error ? error.message : "unknown error")
//   }
//   if (!licenseKey) return { status: "error", message: t("codeFailed") }
//   return redeemOrKeep(licenseKey)
// }
