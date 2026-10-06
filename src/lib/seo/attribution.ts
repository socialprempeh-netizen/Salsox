/**
 * Where a signup came from: the first public page a visitor landed on, the
 * site that sent them, and any campaign tags, classified into a channel
 * ("organic search", "social", ...).
 *
 * It answers the question search work is judged by, "do people who find us
 * through search sign up, and on which pages did they land?", from first-party
 * data, without depending on an analytics vendor or its consent banner:
 *
 * - the browser records the first touch in one small first-party cookie
 *   (`sx_src`, 30 days) when someone lands on a public page
 *   (src/components/analytics/first-touch.tsx);
 * - when an account is created, by password or OAuth, the server reads it and
 *   stores it on the user (src/auth.ts);
 * - the admin SEO page counts signups per channel and per landing page.
 *
 * What is kept is deliberately small: a path on this site, a referrer *host*
 * (never the full URL, which can carry a search query or someone's token) and
 * the standard utm_* tags, each clipped. Nothing identifies a person, and the
 * cookie is not sent anywhere but here.
 *
 * Search queries themselves are not available to a site (engines stopped
 * passing them years ago); they are in Google Search Console and Bing
 * Webmaster Tools, which the admin page links to.
 */

export const ATTRIBUTION_COOKIE = "sx_src"
export const ATTRIBUTION_MAX_AGE_DAYS = 30

export type Touch = {
  /** Landing path on this site, without query or hash. */
  lp: string
  /** Referrer host, or null for a direct visit. */
  ref: string | null
  utm: { source?: string; medium?: string; campaign?: string; term?: string }
  /** ISO timestamp of the first visit. */
  at: string
}

export type Channel = "organic_search" | "paid_search" | "social" | "email" | "referral" | "campaign" | "direct"

export const CHANNELS: Channel[] = ["organic_search", "paid_search", "social", "email", "referral", "campaign", "direct"]

const SEARCH_ENGINES = [/(^|\.)google\./, /(^|\.)bing\.com$/, /(^|\.)duckduckgo\.com$/, /(^|\.)search\.yahoo\./, /(^|\.)yandex\./, /(^|\.)baidu\.com$/, /(^|\.)ecosia\.org$/, /(^|\.)search\.brave\.com$/, /(^|\.)startpage\.com$/, /(^|\.)qwant\.com$/]
const SOCIAL = [/(^|\.)facebook\.com$/, /(^|\.)fb\.me$/, /^t\.co$/, /(^|\.)twitter\.com$/, /(^|\.)x\.com$/, /(^|\.)linkedin\.com$/, /^lnkd\.in$/, /(^|\.)instagram\.com$/, /(^|\.)youtube\.com$/, /(^|\.)reddit\.com$/, /(^|\.)whatsapp\.com$/, /(^|\.)tiktok\.com$/, /(^|\.)threads\.net$/]
const EMAIL = [/(^|\.)mail\.google\.com$/, /(^|\.)outlook\.(live|office)\.com$/, /(^|\.)mail\.yahoo\.com$/]

const clip = (v: string | null | undefined, n = 80) => (v ? v.trim().slice(0, n) || undefined : undefined)

/**
 * The first touch for a visit. `referrer` is document.referrer; a referrer on
 * this site (`ownHost`) is not a source, it is the visitor moving around.
 */
export function buildTouch(input: { pathname: string; search: string; referrer: string; ownHost: string; now: Date }): Touch {
  const params = new URLSearchParams(input.search)
  let ref: string | null = null
  try {
    const host = input.referrer ? new URL(input.referrer).hostname.toLowerCase() : ""
    ref = host && host !== input.ownHost.toLowerCase() ? host.slice(0, 100) : null
  } catch {
    ref = null
  }
  const utm = {
    source: clip(params.get("utm_source")),
    medium: clip(params.get("utm_medium")),
    campaign: clip(params.get("utm_campaign")),
    term: clip(params.get("utm_term")),
  }
  return {
    lp: (input.pathname.split(/[?#]/)[0] || "/").slice(0, 200),
    ref,
    utm: Object.fromEntries(Object.entries(utm).filter(([, v]) => v)) as Touch["utm"],
    at: input.now.toISOString(),
  }
}

export function classifyChannel(touch: Pick<Touch, "ref" | "utm"> | null): Channel {
  if (!touch) return "direct"
  const medium = touch.utm.medium?.toLowerCase() ?? ""
  const host = touch.ref ?? ""
  const isSearch = SEARCH_ENGINES.some((re) => re.test(host)) || /^(organic|search)$/.test(medium)
  if (/^(cpc|ppc|paid|paidsearch|paid_search|sem)$/.test(medium)) return isSearch || /google|bing/.test(touch.utm.source ?? "") ? "paid_search" : "campaign"
  if (/^(email|newsletter)$/.test(medium) || EMAIL.some((re) => re.test(host))) return "email"
  if (/^(social|social-network|social_media)$/.test(medium) || SOCIAL.some((re) => re.test(host))) return "social"
  if (isSearch) return "organic_search"
  if (touch.utm.source || touch.utm.campaign) return "campaign"
  if (host) return "referral"
  return "direct"
}

export function serializeTouch(touch: Touch): string {
  return encodeURIComponent(JSON.stringify(touch))
}

/** The touch from a cookie value, or null for anything malformed. Never throws. */
export function parseTouch(value: string | null | undefined): Touch | null {
  if (!value || value.length > 1500) return null
  try {
    const data = JSON.parse(decodeURIComponent(value)) as Partial<Touch>
    if (typeof data.lp !== "string" || !data.lp.startsWith("/") || typeof data.at !== "string") return null
    const utm = data.utm && typeof data.utm === "object" ? data.utm : {}
    return {
      lp: data.lp.slice(0, 200),
      ref: typeof data.ref === "string" ? data.ref.slice(0, 100) : null,
      utm: {
        source: clip(utm.source),
        medium: clip(utm.medium),
        campaign: clip(utm.campaign),
        term: clip(utm.term),
      },
      at: data.at.slice(0, 30),
    }
  } catch {
    return null
  }
}

/** Reads one cookie out of a Cookie header. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=")
    if (k === name) return v.join("=")
  }
  return null
}
