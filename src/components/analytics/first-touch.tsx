"use client"

/**
 * Records where a visitor first arrived from, once, in the first-party
 * `sx_src` cookie, so that if they later create an account the server can
 * attribute the signup to a channel and a landing page
 * (src/lib/seo/attribution.ts explains what is kept and why).
 *
 * Mounted on the public pages only. Renders nothing, runs after hydration so
 * it never delays a paint, and does nothing when the browser asks not to be
 * tracked (Global Privacy Control or Do Not Track) or a touch is already
 * recorded: the first touch is the one that brought them.
 */
import { useEffect } from "react"
import { ATTRIBUTION_COOKIE, ATTRIBUTION_MAX_AGE_DAYS, buildTouch, serializeTouch } from "@/lib/seo/attribution"

export function FirstTouch() {
  useEffect(() => {
    try {
      const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
      if (nav.globalPrivacyControl || nav.doNotTrack === "1") return
      if (document.cookie.split("; ").some((c) => c.startsWith(`${ATTRIBUTION_COOKIE}=`))) return
      const touch = buildTouch({
        pathname: location.pathname,
        search: location.search,
        referrer: document.referrer,
        ownHost: location.hostname,
        now: new Date(),
      })
      const secure = location.protocol === "https:" ? "; Secure" : ""
      document.cookie = `${ATTRIBUTION_COOKIE}=${serializeTouch(touch)}; Max-Age=${ATTRIBUTION_MAX_AGE_DAYS * 86400}; Path=/; SameSite=Lax${secure}`
    } catch {
      // Cookies disabled: attribution is a nice-to-have, never a requirement.
    }
  }, [])
  return null
}
