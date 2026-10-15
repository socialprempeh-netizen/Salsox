/**
 * PostHog product analytics: whether this deployment has it, and where its
 * events go. Read by the loader (src/components/analytics/posthog.tsx) and by
 * next.config.ts, which opens the Content-Security-Policy to the ingest host
 * only when PostHog is on. Imported by next.config.ts with a relative path,
 * so no `@/` imports here.
 *
 * Why PostHog runs cookieless: the privacy policy and cookie page promise
 * analytics "without cookies and without building a profile of you". In
 * cookieless mode PostHog sets no cookie and touches no browser storage; a
 * visitor is counted by a hash PostHog's servers make from the request and a
 * salt that rotates daily, and nobody is identified. Signups are still tied
 * to their channel, first-party, by the `sx_src` cookie (attribution.ts).
 *
 * Cookieless events are dropped unless cookieless mode is also switched on in
 * the PostHog project's settings (docs/seo.md).
 */

/** A PostHog project API key: public by design, it only lets a browser send events. */
export const POSTHOG_KEY_PATTERN = /^phc_[A-Za-z0-9]{20,80}$/

/** PostHog Cloud's US ingest host, used when NEXT_PUBLIC_POSTHOG_HOST is unset. */
export const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com"

export type PostHogConfig = { key: string; host: string }

/**
 * The deployment's PostHog settings, or null when PostHog is off: no key, a
 * key that is not one, or a host that is not a plain https origin (a typo
 * there would otherwise open the CSP to whatever was typed).
 */
export function posthogConfig(env: Record<string, string | undefined>): PostHogConfig | null {
  const key = env.NEXT_PUBLIC_POSTHOG_KEY?.trim()
  if (!key || !POSTHOG_KEY_PATTERN.test(key)) return null
  const raw = env.NEXT_PUBLIC_POSTHOG_HOST?.trim() || DEFAULT_POSTHOG_HOST
  try {
    const url = new URL(raw)
    if (url.protocol !== "https:" || url.username || url.password || url.pathname.replace(/\/+$/, "") !== "" || url.search || url.hash) return null
    return { key, host: url.origin }
  } catch {
    return null
  }
}

/**
 * What PostHog may see of a page address. Signing links carry the signer's
 * token in the path (/sign/<token>), and auth pages carry tokens in the query
 * (reset-password?token=...), so the query is dropped except for the utm_*
 * tags that measure outreach, and a signing token is replaced.
 */
export function scrubUrl(value: string): string {
  try {
    const url = new URL(value)
    const kept = new URLSearchParams()
    url.searchParams.forEach((v, k) => {
      if (/^utm_(source|medium|campaign|term|content)$/.test(k)) kept.set(k, v.slice(0, 100))
    })
    const path = url.pathname.replace(/^\/sign\/[^/]+/, "/sign/[token]")
    const query = kept.toString()
    return `${url.origin}${path}${query ? `?${query}` : ""}`
  } catch {
    return ""
  }
}
