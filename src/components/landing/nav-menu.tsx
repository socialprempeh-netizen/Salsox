"use client"

/**
 * The public navbar's grouped menus on desktop (lg and up): Why {site}, Free
 * tools, Compare and Resources open a panel each, with Pricing as a plain link
 * beside them. Replaces NavLinks (nav-links.tsx), whose flat row of home-page
 * anchors had no room for the tools, comparisons and use-case pages.
 *
 * What the menus list comes from the server as data (site-nav-data.ts), so
 * this component knows nothing about the registry. It is a disclosure
 * pattern, not an ARIA menu: each trigger is a button with aria-expanded, the
 * panel is a list of ordinary links, and Tab moves through them in order.
 * Escape closes and returns focus to the trigger; a click outside or a route
 * change closes. A mouse opens a group by hovering too, as these menus
 * usually do, with a short grace period so moving the pointer diagonally into
 * the panel does not close it.
 *
 * Animation: a CSS fade and lift (tw-animate-css), not framer-motion. Same
 * exception as session-aware.tsx: this renders on every public page, and the
 * performance pass took framer-motion off their first load. Off under
 * prefers-reduced-motion.
 */
import { useEffect, useId, useRef, useState } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, ChevronDown } from "lucide-react"
import { usePathname } from "@/i18n/navigation"
import { cn } from "@/lib/utils"
import { isCurrent, type NavGroup, type SiteNav } from "@/lib/site-nav"

const HOVER_CLOSE_MS = 150

export function NavMenu({ nav }: { nav: SiteNav }) {
  const t = useTranslations("nav")
  const pathname = usePathname()
  // Remembered with the page it was opened on, so following a link closes
  // the panel without an effect resetting state after the route changes.
  const [opened, setOpened] = useState<{ id: string; path: string } | null>(null)
  const open = opened?.path === pathname ? opened.id : null
  const setOpen = (id: string | null) => setOpened(id ? { id, path: pathname } : null)
  const root = useRef<HTMLElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Opened by hovering: the click that usually follows keeps it open rather
  // than toggling it shut under the pointer.
  const hoverOpened = useRef(false)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpened(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      root.current?.querySelector<HTMLButtonElement>(`[data-nav-trigger="${open}"]`)?.focus()
      setOpened(null)
    }
    document.addEventListener("pointerdown", onPointer)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onPointer)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current)
    closeTimer.current = null
  }
  const hoverOpen = (id: string) => (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    cancelClose()
    if (open !== id) hoverOpened.current = true
    setOpen(id)
  }
  const hoverClose = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    cancelClose()
    closeTimer.current = setTimeout(() => setOpened(null), HOVER_CLOSE_MS)
  }

  // Visual system (globals.css): PandaDoc's navigation type, 15px at 600 in
  // ink, turning to the accent on hover and for the current group. Was
  // text-sm 500 in grey, with a tinted fill when active or hovered.
  const itemClass = (active: boolean) =>
    cn(
      // Was text-[15px] at every width: the larger header type scale
      // (navbar.tsx) from 1280px up. Between 1024 and 1279 five groups, the
      // logo and the account buttons only fit on one line at the old size,
      // so it stays there, never wrapping a label onto two lines.
      // Then 14px medium at every width, per the palette audit's type scale
      // (nav and buttons 13-14px). Was text-[15px] font-semibold … xl:text-[17px].
      "inline-flex items-center gap-1 whitespace-nowrap px-2 py-2 text-[14px] font-medium transition-colors xl:gap-1.5 xl:px-3",
      active ? "text-primary" : "text-foreground hover:text-primary"
    )

  return (
    // Takes the width between the logo and the account buttons, items spread
    // evenly across it (was a tight cluster: `hidden lg:block`, gap-1).
    <nav ref={root} aria-label={t("menu.mainMenu")} className="hidden min-w-0 flex-1 lg:block">
      <ul className="mx-auto flex max-w-3xl items-center justify-evenly">
        {nav.groups.map((group, index) => {
          const isOpen = open === group.id
          const active = group.columns.some((c) => c.links.some((l) => isCurrent(l.href, pathname))) || isCurrent(group.footer.href, pathname)
          return (
            <li key={group.id} className="relative" onPointerEnter={hoverOpen(group.id)} onPointerLeave={hoverClose}>
              <button
                type="button"
                data-nav-trigger={group.id}
                aria-expanded={isOpen}
                aria-controls={`nav-panel-${group.id}`}
                onClick={() => {
                  const keep = isOpen && hoverOpened.current
                  hoverOpened.current = false
                  setOpen(isOpen && !keep ? null : group.id)
                }}
                className={itemClass(active || isOpen)}
              >
                {group.label}
                <ChevronDown className={cn("h-4 w-4 transition-transform motion-reduce:transition-none", isOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {/* The last two open from their right edge: with the menu spread
                  across the bar they sit near the screen's edge, where a
                  panel opening rightwards would run off it. */}
              {isOpen && <Panel group={group} pathname={pathname} align={index >= nav.groups.length - 2 ? "end" : "start"} />}
            </li>
          )
        })}
        <li>
          <Link href={nav.pricing.href} className={itemClass(isCurrent(nav.pricing.href, pathname))}>
            {nav.pricing.label}
          </Link>
        </li>
      </ul>
    </nav>
  )
}

function Panel({ group, pathname, align = "start" }: { group: NavGroup; pathname: string; align?: "start" | "end" }) {
  const headingId = useId()
  const wide = group.columns.length > 1
  return (
    // pt-2 rather than a margin: the gap stays inside the hover area, so the
    // pointer can cross it without leaving the group.
    <div id={`nav-panel-${group.id}`} className={cn("absolute top-full z-50 pt-2", align === "end" ? "right-0" : "left-0")}>
      <div
        className={cn(
          "border border-border bg-popover text-popover-foreground shadow-lg",
          "animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none",
          wide ? "w-[36rem]" : "w-80"
        )}
      >
        {/* The links scroll inside the panel when the group outgrows the
            screen (the "Why" group lists every solution and industry page),
            so the footer link below always stays in view. Was:
            <div className={cn("grid gap-6 p-5", wide && "grid-cols-2")}> */}
        <div className={cn("grid max-h-[calc(100dvh-9rem)] gap-6 overflow-y-auto overscroll-contain p-5", wide && "grid-cols-2")}>
          {group.columns.map((column, i) => (
            <div key={i} className="min-w-0">
              {column.heading && (
                <p id={`${headingId}-${i}`} className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {column.heading}
                </p>
              )}
              <ul aria-labelledby={column.heading ? `${headingId}-${i}` : undefined} className="space-y-0.5">
                {column.links.map((link) => {
                  const current = isCurrent(link.href, pathname)
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={current ? "page" : undefined}
                        className={cn("block px-2 py-1.5 transition-colors hover:bg-accent", current && "bg-primary/5")}
                      >
                        <span className={cn("block text-sm font-medium", current && "text-primary")}>{link.label}</span>
                        {link.description && <span className="mt-0.5 block text-xs text-muted-foreground">{link.description}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
        <Link
          href={group.footer.href}
          className="group flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-7 py-3 text-sm font-medium transition-colors hover:bg-accent"
        >
          <span>
            {group.footer.label}
            {group.footer.description && <span className="ml-2 font-normal text-muted-foreground">{group.footer.description}</span>}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
