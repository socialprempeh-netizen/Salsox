/**
 * Product analytics events, sent from the browser to whichever analytics the
 * deployment has: Google Analytics 4 when NEXT_PUBLIC_GA_MEASUREMENT_ID is set
 * (src/components/analytics/google-analytics.tsx), and Vercel Analytics custom
 * events when it is mounted. With neither, `track` does nothing.
 *
 * The events are the funnel organic search is judged by:
 *
 *   tool_opened      a free tool loaded a file (which tool)
 *   tool_downloaded  a free tool produced a file (which tool)
 *   cta_clicked      a signup or pricing call to action was used (where)
 *   sign_up          an account was created (channel, from attribution.ts)
 *
 * Never put document content, file names, email addresses or anything else
 * a person typed into an event: analytics vendors are third parties, and the
 * free tools promise that files stay on the device. Properties are limited
 * to short identifiers below.
 */
import { track as vercelTrack } from "@vercel/analytics"

export type AnalyticsEvent = "tool_opened" | "tool_downloaded" | "cta_clicked" | "sign_up"
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

export function track(event: AnalyticsEvent, props?: AnalyticsProps): void {
  if (typeof window === "undefined") return
  const params = safeProps(props)
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
