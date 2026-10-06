"use client"

/**
 * The public navbar's menu on phones and tablets (below lg), loaded on first
 * touch by MobileMenu (mobile-menu.tsx) and mounted already open. Replaces
 * mobile-menu-dropdown.tsx, a short Radix dropdown of home-page anchors that
 * could not hold the grouped navigation.
 *
 * A full-screen panel with the same groups as the desktop menus
 * (src/lib/site-nav.ts), each a disclosure that expands in place, then
 * Pricing and the account actions. The page behind does not scroll while it
 * is open; Escape or the close button returns focus to the menu button.
 *
 * Animation: CSS (tw-animate-css), off under prefers-reduced-motion, for the
 * same first-load reason as nav-menu.tsx.
 */
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowRight, ChevronDown, Menu, X } from "lucide-react"
import { GithubIcon } from "@/components/icons/github"
import { Button } from "@/components/ui/button"
import { usePathname } from "@/i18n/navigation"
import { getStartedHref } from "@/lib/landing-cta"
import { isCurrent, type SiteNav } from "@/lib/site-nav"
import { cn } from "@/lib/utils"

const PANEL_ID = "mobile-nav-panel"

export default function MobileNavPanel({
  nav,
  signInHref,
  starHref,
  isAuthenticated,
}: {
  nav: SiteNav
  signInHref: string
  /** Set only on the kit's own site: see the comment in `navbar.tsx`. */
  starHref?: string | null
  isAuthenticated: boolean
}) {
  const t = useTranslations("nav")
  const tCommon = useTranslations("common")
  const pathname = usePathname()
  // Mounted by a tap on the placeholder button, so it starts open; tied to
  // the page it was opened on, so following a link closes it.
  const [openOn, setOpenOn] = useState<string | null>(pathname)
  const open = openOn === pathname
  // The group holding the current page starts expanded.
  const [expanded, setExpanded] = useState<string | null>(
    () => nav.groups.find((g) => g.columns.some((c) => c.links.some((l) => isCurrent(l.href, pathname))))?.id ?? null
  )
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(false)

  useEffect(() => {
    if (!open) {
      // Back to the button that opened it, but only after it was open.
      if (wasOpen.current) trigger.current?.focus()
      wasOpen.current = false
      return
    }
    wasOpen.current = true
    close.current?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = overflow
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const dismiss = () => setOpenOn(null)

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={t("openMenu")}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
      >
        <Menu size={24} />
      </button>
      {open &&
        createPortal(
          <div
            id={PANEL_ID}
            role="dialog"
            aria-modal="true"
            aria-label={t("menu.mainMenu")}
            className="fixed inset-0 z-[70] flex flex-col bg-background animate-in fade-in-0 slide-in-from-top-2 duration-200 motion-reduce:animate-none lg:hidden"
          >
            <div className="flex h-16 shrink-0 items-center justify-end border-b border-border px-4">
              <button
                ref={close}
                type="button"
                aria-label={t("menu.closeMenu")}
                onClick={dismiss}
                className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X size={24} />
              </button>
            </div>

            <nav aria-label={t("menu.mainMenu")} className="flex-1 overflow-y-auto overscroll-contain px-4 py-2">
              <ul className="divide-y divide-border">
                {nav.groups.map((group) => {
                  const isExpanded = expanded === group.id
                  return (
                    <li key={group.id}>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={`${PANEL_ID}-${group.id}`}
                        onClick={() => setExpanded(isExpanded ? null : group.id)}
                        className="flex w-full items-center justify-between py-4 text-left text-base font-semibold"
                      >
                        {group.label}
                        <ChevronDown
                          className={cn("h-5 w-5 text-muted-foreground transition-transform motion-reduce:transition-none", isExpanded && "rotate-180")}
                          aria-hidden="true"
                        />
                      </button>
                      {isExpanded && (
                        <div id={`${PANEL_ID}-${group.id}`} className="pb-4 animate-in fade-in-0 slide-in-from-top-1 duration-150 motion-reduce:animate-none">
                          {group.columns.map((column, i) => (
                            <div key={i} className={cn(i > 0 && "mt-4")}>
                              {column.heading && (
                                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{column.heading}</p>
                              )}
                              <ul>
                                {column.links.map((link) => {
                                  const current = isCurrent(link.href, pathname)
                                  return (
                                    <li key={link.href}>
                                      <Link
                                        href={link.href}
                                        onClick={dismiss}
                                        aria-current={current ? "page" : undefined}
                                        className={cn("block py-2.5 text-[15px]", current ? "font-medium text-primary" : "text-foreground")}
                                      >
                                        {link.label}
                                      </Link>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          ))}
                          <Link href={group.footer.href} onClick={dismiss} className="mt-2 inline-flex items-center gap-1.5 py-2 text-sm font-medium text-primary">
                            {group.footer.label}
                            <ArrowRight className="h-4 w-4" aria-hidden="true" />
                          </Link>
                        </div>
                      )}
                    </li>
                  )
                })}
                <li>
                  <Link
                    href={nav.pricing.href}
                    onClick={dismiss}
                    aria-current={isCurrent(nav.pricing.href, pathname) ? "page" : undefined}
                    className="block py-4 text-base font-semibold"
                  >
                    {nav.pricing.label}
                  </Link>
                </li>
              </ul>
            </nav>

            <div className="grid shrink-0 gap-2 border-t border-border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {isAuthenticated ? (
                <Button asChild size="lg" className="w-full">
                  <Link href="/dashboard" onClick={dismiss}>{t("dashboard")}</Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg" className="w-full">
                    {starHref ? (
                      <a href={starHref} target="_blank" rel="noreferrer">
                        <GithubIcon className="h-4 w-4" />
                        {tCommon("starOnGitHub")}
                      </a>
                    ) : (
                      <Link href={getStartedHref()} onClick={dismiss}>{t("getStarted")}</Link>
                    )}
                  </Button>
                  <Button asChild size="lg" variant="outline" className="w-full">
                    <Link href={signInHref} onClick={dismiss}>{t("signIn")}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
