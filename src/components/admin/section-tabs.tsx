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
 * The underline under the current tab slides to the new one on navigation
 * (framer-motion `layoutId`); with prefers-reduced-motion it jumps. On a phone
 * the row scrolls inside itself, never the page.
 */
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
  const section = sectionFor(pathname)
  if (!section || section.tabs.length < 2) return null
  const current = activeTab(section, pathname)

  return (
    <nav aria-label={t("sectionPages")} className="-mx-6 mb-6 overflow-x-auto border-b border-border px-6">
      <ul className="flex w-max gap-1">
        {section.tabs.map((tab) => {
          const active = tab.href === current?.href
          return (
            <li key={tab.href} className="relative">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-11 items-center px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t(tab.key)}
              </Link>
              {active && (
                <motion.span
                  layoutId="admin-section-tab"
                  aria-hidden
                  className="absolute inset-x-2 -bottom-px h-0.5 bg-primary"
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
