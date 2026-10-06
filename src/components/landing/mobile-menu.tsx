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
 *
 * It now loads mobile-nav-panel.tsx, the grouped menu (Why, Free tools,
 * Compare, Resources, Pricing), and shows below lg, where the desktop menus
 * (nav-menu.tsx) give way.
 */
import { cloneElement } from "react"
import { useTranslations } from "next-intl"
import { Menu } from "lucide-react"
import { useDeferred } from "@/hooks/use-deferred"
import { useSignedIn } from "@/components/landing/session-aware"
import type { SiteNav } from "@/lib/site-nav"

// Was import("./mobile-menu-dropdown"): a flat list of home-page anchors,
// replaced by the grouped panel.
// const loadDropdown = () => import("./mobile-menu-dropdown")
const loadDropdown = () => import("./mobile-nav-panel")

export function MobileMenu(props: {
  signInHref: string
  /** Set only on the kit's own site: see the comment in `navbar.tsx`. */
  starHref?: string | null
  // Was passed by the navbar from the server session; now asked from the
  // browser (session-aware.tsx) so the navbar can be static.
  // isAuthenticated: boolean
  // Replaced by `nav`, which leaves the blog out itself when it has no posts.
  // showBlog?: boolean
  /** The grouped navigation, built on the server (site-nav-data.ts). */
  nav: SiteNav
}) {
  const t = useTranslations("nav")
  const { Component: Dropdown, triggerProps } = useDeferred(loadDropdown)
  const signedIn = useSignedIn()

  if (Dropdown) return <Dropdown {...props} isAuthenticated={signedIn === true} />
  return cloneElement(
    <button
      type="button"
      aria-label={t("openMenu")}
      aria-expanded={false}
      className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
    >
      <Menu size={24} />
    </button>,
    triggerProps
  )
}
