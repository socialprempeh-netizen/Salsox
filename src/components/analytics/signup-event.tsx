"use client"

/**
 * Sends the `sign_up` analytics event (src/lib/analytics.ts) once, from the
 * browser, on the first dashboard page a new account sees, with the channel
 * the account was attributed to (src/lib/seo/attribution.ts). That is what
 * lets Google Analytics report signups from organic search as a conversion.
 *
 * The dashboard layout renders this only for an account created in the last
 * few minutes; localStorage keeps it to one event per account on this
 * device, so a reload does not count the signup twice.
 */
import { useEffect } from "react"
import { track } from "@/lib/analytics"

export function SignupEvent({ userId, channel }: { userId: string; channel: string }) {
  useEffect(() => {
    const key = `sx-signup-tracked-${userId}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, "1")
    } catch {
      // Storage disabled: send it anyway, at worst twice.
    }
    track("sign_up", { channel })
  }, [userId, channel])
  return null
}
