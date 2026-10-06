import Script from "next/script"

/**
 * Google Analytics 4, mounted only when NEXT_PUBLIC_GA_MEASUREMENT_ID is set
 * (a `G-` id). With it unset, nothing loads and no Google host is allowed by
 * the Content-Security-Policy (src/lib/security-headers.ts adds them only
 * when the id is present).
 *
 * Loaded with `lazyOnload`, after the page is idle, so it never competes with
 * the page's own content for a phone's first seconds: Core Web Vitals are
 * measured on real visits, and analytics that slows the page it measures
 * defeats itself. Events go through `track` in src/lib/analytics.ts.
 *
 * Whether you need a consent banner before loading GA depends on where your
 * visitors are (it sets cookies); see docs/seo.md.
 */
export const GA_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/

export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
  if (!id || !GA_ID_PATTERN.test(id)) return null
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="lazyOnload" />
      <Script id="ga-init" strategy="lazyOnload">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${id}');`}
      </Script>
    </>
  )
}
