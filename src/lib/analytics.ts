/**
 * Product analytics events, sent from the browser to whichever analytics the
 * deployment has: Google Analytics 4 when NEXT_PUBLIC_GA_MEASUREMENT_ID is set
 * (src/components/analytics/google-analytics.tsx), PostHog when
 * NEXT_PUBLIC_POSTHOG_KEY is set (src/components/analytics/posthog.tsx), and
 * Vercel Analytics custom events when it is mounted. With none, `track` does
 * nothing.
 *
 * The events are the funnel organic search is judged by:
 *
 *   tool_opened      a free tool loaded a file (which tool)
 *   tool_downloaded  a free tool produced a file (which tool)
 *   cta_clicked      a signup or pricing call to action was used (where)
 *   template_used    a free document template was copied or downloaded on
 *                    its public page, or turned into a real document in the
 *                    dashboard (which template; action: copy, download or
 *                    create)
 *   sign_up          an account was created (channel, from attribution.ts)
 *   document_sent    a document went out for signature (via: quick_send or
 *                    editor), the end of the signup-to-first-document funnel
 *
 * Never put document content, file names, email addresses or anything else
 * a person typed into an event: analytics vendors are third parties, and the
 * free tools promise that files stay on the device. Properties are limited
 * to short identifiers below.
 */
import { track as vercelTrack } from "@vercel/analytics"

export type AnalyticsEvent = "tool_opened" | "tool_downloaded" | "cta_clicked" | "template_used" | "sign_up" | "document_sent"
export type AnalyticsProps = Record<string, string | number | boolean>

declare global {
  interface Window {
    gtag?: (command: "event", name: string, params?: AnalyticsProps) => void
  }
}

/** Keeps properties to short identifiers: no free text reaches a vendor. */
export function safeProps(props: AnalyticsProps = {}): AnalyticsProps {
  return Object.fromEntries(
    Object.entries(props)
      .filter(([key]) => /^[a-z_]{1,40}$/.test(key))
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 100) : value])
  )
}

/** The part of the PostHog client `track` uses, so this file does not import the SDK. */
export type PostHogCapture = { capture: (event: string, props?: AnalyticsProps) => unknown }

let posthogClient: PostHogCapture | null = null
// PostHog loads after the page is idle; events from before that wait here
// (a few at most: a signup or a tool opened in the first seconds).
let posthogQueue: [AnalyticsEvent, AnalyticsProps][] = []

/** Called by the PostHog loader once the SDK is ready; sends what waited. */
export function setPostHogClient(client: PostHogCapture | null): void {
  posthogClient = client
  if (!client) return
  const waiting = posthogQueue
  posthogQueue = []
  for (const [event, params] of waiting) {
    try {
      client.capture(event, params)
    } catch {
      // An analytics failure must never break the page.
    }
  }
}

/** Whether the PostHog loader is mounted at all; without it nothing is queued. */
let posthogExpected = false
export function expectPostHog(): void {
  posthogExpected = true
}

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return
  const params = safeProps(props)
  try {
    if (posthogClient) posthogClient.capture(event, params)
    else if (posthogExpected && posthogQueue.length < 20) posthogQueue.push([event, params])
  } catch {
    // Same.
  }
  try {
    window.gtag?.("event", event, params)
  } catch {
    // An analytics failure must never break the page.
  }
  try {
    vercelTrack(event, params)
  } catch {
    // Same.
  }
}
