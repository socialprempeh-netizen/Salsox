/**
 * Consent for Google Analytics 4, which sets cookies (`_ga`, `_ga_<id>`) and
 * so asks first. Read by the GA loader (src/components/analytics/
 * google-analytics-loader.tsx) and the consent banner beside it.
 *
 * GA runs in Consent Mode v2: every storage type is denied by default, so
 * until a visitor accepts, GA sets no cookie and sends only cookieless pings
 * (which Google uses for modelling, not for reports). Accepting grants
 * analytics storage only; the ad types stay denied, because nothing here
 * advertises. The choice is kept in local storage on this device, and asked
 * again after CONSENT_MAX_AGE_MS, as consent should not be taken as given
 * forever.
 *
 * Like PostHog (src/components/analytics/posthog.tsx), GA never runs on
 * signing pages, whose path is the signer's token, nor when the browser
 * sends Global Privacy Control or Do Not Track: then there is no banner
 * either, because the browser has already answered.
 */

export type ConsentChoice = "granted" | "denied"

/** Local storage key for the visitor's choice. */
export const CONSENT_KEY = "sx_analytics_consent"

/** Asked again after about thirteen months. */
export const CONSENT_MAX_AGE_MS = 395 * 24 * 60 * 60 * 1000

/** Window event the footer's "Cookie settings" button sends to reopen the banner. */
export const CONSENT_OPEN_EVENT = "sx:consent-open"

/** Consent Mode v2 defaults: nothing stored, nothing for ads. */
export const CONSENT_DEFAULT = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
  analytics_storage: "denied",
} as const

/** The Consent Mode update for a choice: analytics storage only. */
export function consentUpdate(choice: ConsentChoice): { analytics_storage: ConsentChoice } {
  return { analytics_storage: choice }
}

/** The stored form of a choice. */
export function serializeConsent(choice: ConsentChoice, now: number): string {
  return JSON.stringify({ choice, at: now })
}

/**
 * The choice stored on this device, or null when there is none, it is not
 * one we wrote, or it has expired.
 */
export function parseConsent(raw: string | null | undefined, now: number): ConsentChoice | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as { choice?: unknown; at?: unknown }
    if (value.choice !== "granted" && value.choice !== "denied") return null
    if (typeof value.at !== "number" || value.at > now || now - value.at > CONSENT_MAX_AGE_MS) return null
    return value.choice
  } catch {
    return null
  }
}

/** Whether a page is measured at all: never a signing page. */
export function isMeasuredPath(pathname: string): boolean {
  return !pathname.startsWith("/sign/")
}

/** Whether the browser has opted out already (Global Privacy Control, Do Not Track). */
export function browserOptedOut(nav: { globalPrivacyControl?: boolean; doNotTrack?: string | null }): boolean {
  return Boolean(nav.globalPrivacyControl) || nav.doNotTrack === "1"
}

/** The choice stored in this browser; null where storage is blocked. */
export function readConsent(): ConsentChoice | null {
  try {
    return parseConsent(localStorage.getItem(CONSENT_KEY), Date.now())
  } catch {
    return null
  }
}

type GtagWindow = Window & { gtag?: (...args: unknown[]) => void }

/**
 * Records a choice and tells GA straight away, so accepting counts the page
 * the visitor is on. A blocked storage only means the banner asks again.
 */
export function saveConsent(choice: ConsentChoice): void {
  try {
    localStorage.setItem(CONSENT_KEY, serializeConsent(choice, Date.now()))
  } catch {
    // Private mode or blocked storage: the choice holds for this page only.
  }
  try {
    ;(window as GtagWindow).gtag?.("consent", "update", consentUpdate(choice))
  } catch {
    // An analytics failure must never break the page.
  }
}

/** Reopens the consent banner (the footer's "Cookie settings"). */
export function openConsent(): void {
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))
}
