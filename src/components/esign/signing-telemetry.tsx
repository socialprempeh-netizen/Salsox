"use client"

/**
 * What the signing page tells Sentry, so the next failure there says what was
 * happening instead of only that something failed.
 *
 * Why: a signer reported the page failing inside Gmail's in-app browser, and
 * the report held an error reference and nothing else. These add, to every
 * event from the signing page:
 *
 * - tags: `area: sign`, the embedded browser if any (src/lib/browser-env.ts),
 *   and the last signing step reached;
 * - a `browser_env` context: user agent, missing features, viewport, whether
 *   the device was online;
 * - a trail of `signing` breadcrumbs, one per step (PDF requested, loaded,
 *   field saved, payment started, completed), with an action's returned error
 *   kept as a warning breadcrumb: those are shown as a toast and never thrown,
 *   so without this they left no trace at all.
 *
 * And `reportSigningFailure` sends what used to be swallowed: a PDF that
 * failed to load or a page that failed to render showed an error text, or a
 * blank page, and reported nothing.
 *
 * The signing token is never added here, and the URL it appears in is
 * scrubbed from every event before it leaves (src/lib/sentry.ts). Without a
 * DSN every call is a no-op.
 */
import { useEffect } from "react"
import * as Sentry from "@sentry/nextjs"
import { inAppBrowser, missingFeatures } from "@/lib/browser-env"

/** The steps the trail records, in the order a signer meets them. */
export type SigningStep =
  | "page.open"
  | "pdf.load"
  | "pdf.loaded"
  | "pdf.render"
  | "intro.start"
  | "field.open"
  | "field.save"
  | "payment.start"
  | "signing.complete"
  | "signing.decline"

type Data = Record<string, string | number | boolean | null | undefined>

/** Records a step: a breadcrumb, and the tag that says how far the signer got. */
export function signingStep(step: SigningStep, data?: Data) {
  Sentry.addBreadcrumb({ category: "signing", message: step, data, level: "info" })
  Sentry.setTag("signing.step", step)
}

/** An action that returned an error rather than throwing: kept as a warning. */
export function signingProblem(step: SigningStep, error: string, data?: Data) {
  Sentry.addBreadcrumb({ category: "signing", message: `${step} failed`, data: { ...data, error }, level: "warning" })
}

/** Reports a failure the page handles itself, which would otherwise go unseen. */
export function reportSigningFailure(error: unknown, step: SigningStep, data?: Data) {
  Sentry.captureException(error, { tags: { area: "sign", "signing.step": step }, contexts: { signing: { step, ...data } } })
}

/** The browser facts every signing event carries. */
function browserEnv() {
  const ua = navigator.userAgent
  return {
    userAgent: ua,
    inAppBrowser: inAppBrowser(ua) ?? "none",
    missingFeatures: missingFeatures(globalThis as unknown as Record<string, unknown>).join(", ") || "none",
    viewport: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio || 1}`,
    online: navigator.onLine,
    language: navigator.language,
  }
}

/**
 * Mounted once by the signing layout: tags the scope for every later event
 * from the page and starts the trail. Renders nothing.
 */
export function SigningDiagnostics() {
  useEffect(() => {
    const env = browserEnv()
    Sentry.setTag("area", "sign")
    Sentry.setTag("in_app_browser", env.inAppBrowser)
    Sentry.setContext("browser_env", env)
    signingStep("page.open", { inAppBrowser: env.inAppBrowser, missingFeatures: env.missingFeatures })
  }, [])
  return null
}
