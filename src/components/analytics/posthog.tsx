"use client"

/**
 * PostHog product analytics, mounted by the root layout only when
 * NEXT_PUBLIC_POSTHOG_KEY is set (src/lib/posthog-config.ts). It receives page
 * views, with their utm_* tags so outreach channels can be compared, and the
 * events `track` sends (src/lib/analytics.ts).
 *
 * Set up to keep the promises in the privacy policy and cookie page:
 *
 * - cookieless: no cookie, no local or session storage, nobody identified;
 * - no autocapture, session recording, surveys, heatmaps or dead-click
 *   capture, which would read what is on the screen (names, document titles);
 * - no remote config or extra scripts: everything it does is stated here, and
 *   the browser talks to the ingest host alone (the only host the CSP adds);
 * - addresses scrubbed of tokens and free text before they leave (scrubUrl);
 * - nothing at all on signing pages, nor when the browser sends Global
 *   Privacy Control or Do Not Track.
 *
 * The SDK is imported after the page is idle, so it never competes with a
 * phone's first seconds; events sent before then are queued by `track`.
 */
import { useEffect } from "react"
import { expectPostHog, setPostHogClient } from "@/lib/analytics"
import { scrubUrl, type PostHogConfig } from "@/lib/posthog-config"

/** Event properties that carry an address, scrubbed before sending. */
const URL_PROPS = ["$current_url", "$referrer", "$initial_referrer", "$prev_pageview_url"] as const

export function PostHogAnalytics({ config }: { config: PostHogConfig }) {
  useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.globalPrivacyControl || nav.doNotTrack === "1") return
    // A signing link's path is its token: these pages are never measured.
    if (location.pathname.startsWith("/sign/")) return
    expectPostHog()

    let cancelled = false
    const start = () => {
      import("posthog-js")
        .then(({ default: posthog }) => {
          if (cancelled) return
          posthog.init(config.key, {
            api_host: config.host,
            cookieless_mode: "always",
            person_profiles: "never",
            autocapture: false,
            capture_pageview: "history_change",
            capture_pageleave: false,
            capture_dead_clicks: false,
            capture_exceptions: false,
            capture_performance: false,
            disable_session_recording: true,
            disable_surveys: true,
            disable_web_experiments: true,
            disable_external_dependency_loading: true,
            advanced_disable_flags: true,
            mask_personal_data_properties: true,
            before_send: (event) => {
              if (!event) return null
              // Moving onto a signing page in the same tab: stop there.
              if (typeof event.properties?.$pathname === "string" && event.properties.$pathname.startsWith("/sign/")) return null
              for (const prop of URL_PROPS) {
                const value = event.properties?.[prop]
                if (typeof value === "string" && value.startsWith("http")) event.properties[prop] = scrubUrl(value)
              }
              if (typeof event.properties?.$pathname === "string") event.properties.$pathname = event.properties.$pathname.replace(/^\/sign\/[^/]+/, "/sign/[token]")
              return event
            },
          })
          setPostHogClient(posthog)
        })
        .catch(() => {
          // Blocked or offline: analytics is never a requirement.
        })
    }
    // Safari has no requestIdleCallback: a short timeout stands in for it.
    const hasIdle = typeof window.requestIdleCallback === "function"
    const idle = hasIdle ? window.requestIdleCallback(start, { timeout: 4000 }) : null
    const timer = hasIdle ? null : setTimeout(start, 2000)
    return () => {
      cancelled = true
      if (idle !== null) window.cancelIdleCallback(idle)
      if (timer !== null) clearTimeout(timer)
    }
  }, [config.key, config.host])
  return null
}
