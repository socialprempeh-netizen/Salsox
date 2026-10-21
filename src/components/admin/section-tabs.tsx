"use client"

/**
 * The tab row at the top of an admin section with more than one page (Users:
 * Accounts, Customers, Waitlist; Analytics: Growth, SEO health, Outreach…),
 * from the map in src/lib/admin/sections.ts.
 *
 * Rendered once by the admin layout rather than by each page, so the pages
 * that predate the sections (customers, moderation, seo, outreach) gained
 * their tabs without being edited. Sections with a single page get no row.
 *
 * The current tab is a raised white tab joined to the page below it, with a
 * teal rule along its top; the whole tab slides to the new one on navigation
 * (framer-motion `layoutId`), and with prefers-reduced-motion it jumps. Was a
 * plain underline under the current tab. On a phone the row scrolls inside
 * itself, never the page, and is scrolled so the current tab is in view (the
 * SEO agent tab sits past the edge of a 360px screen otherwise).
 */
import { useEffect, useRef } from "react"
import Link from "next/link"
import { motion, useReducedMotion } from "framer-motion"
import { useTranslations } from "next-intl"
import { useRenderedPathname } from "@/hooks/use-rendered-pathname"
import { activeTab, sectionFor } from "@/lib/admin/sections"
import { cn } from "@/lib/utils"

export function SectionTabs() {
  const t = useTranslations("dashboard.nav")
  const pathname = useRenderedPathname()
  const reduceMotion = useReducedMotion()
  const navRef = useRef<HTMLElement>(null)
  const section = sectionFor(pathname)

  // Horizontal only: scrollIntoView would also move the page vertically.
  useEffect(() => {
    const nav = navRef.current
    const tab = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !tab) return
    // Measured against the strip, not with offsetLeft: each tab's <li> is
    // `relative`, so offsetLeft was relative to the li and always about 0.
    const navBox = nav.getBoundingClientRect()
    const tabBox = tab.getBoundingClientRect()
    const left = nav.scrollLeft + tabBox.left - navBox.left - (navBox.width - tabBox.width) / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: reduceMotion ? "auto" : "smooth" })
  }, [pathname, reduceMotion])

  if (!section || section.tabs.length < 2) return null
  const current = activeTab(section, pathname)

  return (
    <nav ref={navRef} aria-label={t("sectionPages")} className="-mx-4 mb-6 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6">
      <ul className="flex w-max gap-0.5 pt-1">
        {section.tabs.map((tab) => {
          const active = tab.href === current?.href
          return (
            <li key={tab.href} className="relative">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative z-10 inline-flex h-11 items-center whitespace-nowrap px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {t(tab.key)}
              </Link>
              {active && (
                // Was an underline: absolute inset-x-2 -bottom-px h-0.5 bg-primary.
                // Now the tab itself, covering the strip's bottom border so it
                // reads as joined to the page.
                <motion.span
                  layoutId="admin-section-tab"
                  aria-hidden
                  className="absolute inset-x-0 -bottom-px top-0 border-x border-t border-border bg-background before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-primary"
                  transition={reduceMotion ? { duration: 0 } : { type: "spring", bounce: 0.15, duration: 0.35 }}
                />
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
