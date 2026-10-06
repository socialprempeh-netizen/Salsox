"use client"

/**
 * The public navbar's menu button on phones.
 *
 * Renders the trigger only; the dropdown (mobile-menu-dropdown.tsx) loads on
 * the first touch, focus or hover and mounts already open on the first tap.
 * Phones are exactly where the Radix dropdown it needs cost the most to ship
 * with every page, and the menu is opened on a fraction of visits
 * (src/hooks/use-deferred.ts). Same props as before, so the navbar did not
 * change.
 */
import { cloneElement } from "react"
import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import { useDeferred } from "@/hooks/use-deferred"
import { useSignedIn } from "@/components/landing/session-aware"

const loadDropdown = () => import("./mobile-menu-dropdown")

export function MobileMenu(props: {
  signInHref: string
  /** Set only on the kit's own site: see the comment in `navbar.tsx`. */
  starHref?: string | null
  // Was passed by the navbar from the server session; now asked from the
  // browser (session-aware.tsx) so the navbar can be static.
  // isAuthenticated: boolean
  /** From the server (`hasPosts()`): an empty blog gets no menu entry. */
  showBlog?: boolean
}) {
  const t = useTranslations("nav")
  const { Component: Dropdown, triggerProps } = useDeferred(loadDropdown)
  const signedIn = useSignedIn()

  if (Dropdown) return <Dropdown {...props} isAuthenticated={signedIn === true} />
  return cloneElement(
    <button
      type="button"
      aria-label={t("openMenu")}
      aria-haspopup="menu"
      className="flex h-11 w-11 items-center justify-center rounded-[var(--radius)] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
    >
      <Menu size={24} />
    </button>,
    triggerProps
  )
}
