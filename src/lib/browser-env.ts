/**
 * What kind of browser a page is running in, for error reports: whether it
 * is an app's embedded browser (Gmail, the Google app, Facebook, Instagram,
 * LinkedIn, or a generic Android or iOS WebView), and which of the browser
 * features the signing flow leans on are missing.
 *
 * Signers mostly arrive by tapping a link in an email or chat app, and those
 * apps open it in their own browser, often an engine a release or more behind
 * the phone's own. When something fails there, the report needs to say so, or
 * the failure looks like a bug nobody can reproduce on a desktop. Used by
 * src/components/esign/signing-telemetry.ts to tag every Sentry event from
 * the signing page.
 *
 * Detection is by user agent and is a best effort: an app can change its
 * user agent at any time. "ios-webview" is the honest fallback for an iOS
 * page without Safari's own token, which is what an in-app WKWebView sends.
 *
 * Pure: takes the user agent and the global scope as arguments.
 */

export type InAppBrowser =
  | "gmail"
  | "google-app"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "android-webview"
  | "ios-webview"

/** The embedded browser `ua` belongs to, or null for a regular browser. */
export function inAppBrowser(ua: string): InAppBrowser | null {
  if (/\bGmail\b|com\.google\.android\.gm/i.test(ua)) return "gmail"
  if (/\bGSA\/\d/.test(ua)) return "google-app"
  if (/\bFBAN\/|\bFBAV\//.test(ua)) return "facebook"
  if (/\bInstagram\b/.test(ua)) return "instagram"
  if (/\bLinkedInApp\b/.test(ua)) return "linkedin"
  if (/Android.*;\s*wv\)/.test(ua)) return "android-webview"
  if (/\b(iPhone|iPad|iPod)\b/.test(ua) && /AppleWebKit/.test(ua) && !/\bSafari\//.test(ua)) return "ios-webview"
  return null
}

/**
 * The features the signing flow uses, each with how to tell it is there.
 * Newer than Next 16's baseline (Safari 16.4, Chrome 111) is marked: those
 * are the ones an older embedded browser is likely to lack.
 */
const FEATURES: Record<string, (scope: Record<string, unknown>) => boolean> = {
  IntersectionObserver: (s) => typeof s.IntersectionObserver === "function",
  ResizeObserver: (s) => typeof s.ResizeObserver === "function",
  structuredClone: (s) => typeof s.structuredClone === "function",
  Worker: (s) => typeof s.Worker === "function",
  PointerEvent: (s) => typeof s.PointerEvent === "function",
  // Past the baseline: pdf.js's legacy build polyfills these, so a missing
  // one should not break anything; listed so a report shows the engine's age.
  "Promise.withResolvers": (s) => typeof (s.Promise as { withResolvers?: unknown } | undefined)?.withResolvers === "function",
  "Promise.try": (s) => typeof (s.Promise as { try?: unknown } | undefined)?.try === "function",
}

/** The listed features `scope` (normally `globalThis`) lacks, in a stable order. */
export function missingFeatures(scope: Record<string, unknown>): string[] {
  return Object.entries(FEATURES)
    .filter(([, has]) => !has(scope))
    .map(([name]) => name)
}
