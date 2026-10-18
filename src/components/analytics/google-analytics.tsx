// import Script from "next/script"
import { isKitSite } from "@/config/kit"
import { ConsentBanner } from "@/components/analytics/consent-banner"
import { GoogleAnalyticsLoader } from "@/components/analytics/google-analytics-loader"

/**
 * Google Analytics 4, mounted only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set
 * (a `G-` id). With it unset, nothing loads and no Google host is allowed by
 * the Content-Security-Policy (src/lib/security-headers.ts adds them only
 * when the id is present).
 *
 * gtag.js loads with `lazyOnload`, after the page is idle, so it never
 * competes with the page's own content for a phone's first seconds: Core Web
 * Vitals are measured on real visits, and analytics that slows the page it
 * measures defeats itself. Events go through `track` in src/lib/analytics.ts.
 *
 * GA sets cookies, so it runs in Consent Mode v2 behind a consent banner:
 * nothing is stored until the visitor accepts (src/lib/analytics-consent.ts).
 * Page views are sent by the loader, with tokens scrubbed from the address,
 * on every client-side navigation as well as the first load.
 */
export const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/

/** The deployment's measurement id, or null when GA is off. */
export function gaMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
  return id && GA_ID_PATTERN.test(id) ? id : null
}

export function GoogleAnalytics() {
  const id = gaMeasurementId()
  if (!id) return null
  return (
    <>
      <GoogleAnalyticsLoader id={id} />
      <ConsentBanner policyHref={isKitSite ? "/privacy#cookies" : "/cookies"} />
    </>
  )
}

// Was: the config sent straight away, with GA's own automatic page views.
// That set cookies without asking, and sent raw addresses, tokens included,
// to Google. Replaced by the consent-aware loader above.
// export function GoogleAnalytics() {
//   const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
//   if (!id || !GA_ID_PATTERN.test(id)) return null
//   return (
//     <>
//       <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="lazyOnload" />
//       <Script id="ga-init" strategy="lazyOnload">
//         {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${id}');`}
//       </Script>
//     </>
//   )
// }
