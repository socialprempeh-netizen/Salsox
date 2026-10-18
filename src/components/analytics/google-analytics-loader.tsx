"use client"

/**
 * Starts Google Analytics 4 in the browser and sends a page view on every
 * navigation, including the App Router's client-side ones. Mounted by
 * google-analytics.tsx, which only does so when a measurement id is set.
 *
 * Why page views are sent from here and not by GA itself: GA's automatic
 * views read the raw address, and ours can carry tokens (reset-password and
 * verify-email links put one in the query). Each view goes out with the
 * address scrubbed the same way PostHog's are (scrubUrl), and is set as the
 * page for GA's other events too. Because of that, "Page changes based on
 * browser history events" must be off in the GA stream's enhanced
 * measurement settings, or every client-side navigation counts twice
 * (docs/seo.md).
 *
 * Consent Mode v2 defaults go in before the config, so nothing is stored
 * until the visitor accepts (src/lib/analytics-consent.ts). gtag.js itself
 * loads with `lazyOnload`, after the page is idle; calls made before that
 * wait in the dataLayer.
 */
import Script from "next/script"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { CONSENT_DEFAULT, browserOptedOut, consentUpdate, isMeasuredPath, readConsent } from "@/lib/analytics-consent"
import { scrubUrl } from "@/lib/posthog-config"

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void } & Record<string, unknown>

export function GoogleAnalyticsLoader({ id }: { id: string }) {
  const pathname = usePathname()
  const [load, setLoad] = useState(false)
  // The scrubbed address of the last page sent, as the next one's referrer.
  const previous = useRef<string | null>(null)
  const sentFor = useRef<string | null>(null)

  useEffect(() => {
    if (browserOptedOut(navigator as Navigator & { globalPrivacyControl?: boolean })) return
    const w = window as unknown as GtagWindow
    const measured = isMeasuredPath(pathname)
    // GA's own off switch, read on every hit: moving onto a signing page in
    // the same tab silences it, moving off turns it back on.
    w[`ga-disable-${id}`] = !measured
    if (!measured) return

    if (!w.gtag) {
      w.dataLayer = w.dataLayer || []
      // gtag.js reads the `arguments` object itself, not an array.
      w.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        w.dataLayer!.push(arguments)
      }
      w.gtag("consent", "default", CONSENT_DEFAULT)
      const stored = readConsent()
      if (stored) w.gtag("consent", "update", consentUpdate(stored))
      w.gtag("js", new Date())
      w.gtag("config", id, { send_page_view: false })
      // gtag.js is mounted once the page is idle (and next/script then waits
      // for its own lazyOnload); Safari has no requestIdleCallback.
      const mount = () => setLoad(true)
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(mount, { timeout: 4000 })
      else setTimeout(mount, 2000)
    }

    // One view per path: an effect that runs twice for the same page (React's
    // Strict Mode does this in development) must not count it twice.
    if (sentFor.current === pathname) return
    sentFor.current = pathname
    const location = scrubUrl(window.location.href)
    const referrer = previous.current ?? (document.referrer ? scrubUrl(document.referrer) : "")
    w.gtag("set", { page_location: location, page_referrer: referrer })
    w.gtag("event", "page_view", { page_location: location, page_referrer: referrer, page_title: document.title })
    previous.current = location
  }, [id, pathname])

  return load ? <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="lazyOnload" /> : null
}
