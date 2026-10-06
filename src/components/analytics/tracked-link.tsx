"use client"

/**
 * A link that records a `cta_clicked` event (src/lib/analytics.ts) before
 * navigating: the signup and pricing calls to action on the landing, tool and
 * comparison pages, so organic visits can be followed through to a signup.
 * Navigation is never delayed or blocked by the event.
 */
import Link from "next/link"
import { track } from "@/lib/analytics"

export function TrackedLink({
  href,
  location,
  className,
  children,
}: {
  href: string
  /** Where the link sits, e.g. "hero:/sign-pdf". A short identifier only. */
  location: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <Link href={href} className={className} onClick={() => track("cta_clicked", { location, target: href })}>
      {children}
    </Link>
  )
}
