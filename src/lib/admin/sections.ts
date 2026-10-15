/**
 * The admin console's map: eight sections, the pages under each, and which
 * section a URL belongs to. The sidebar, the phone menu and each section's
 * tab row all read it, so the three cannot disagree about where a page lives.
 *
 * Every admin page that existed before the reorganisation keeps its URL and
 * is placed in the section it fits best, as a tab:
 *
 *   /admin/customers   Users (the per-customer breakdown)
 *   /admin/moderation  Support & System Health
 *   /admin/seo         Analytics (search health)
 *   /admin/outreach    Analytics (founder outreach)
 *
 * Kept free of icons and React so it can be tested; the nav components attach
 * an icon per section id.
 */

export const ADMIN_SECTIONS = ["overview", "users", "documents", "analytics", "revenue", "subscriptions", "health", "settings"] as const
export type AdminSectionId = (typeof ADMIN_SECTIONS)[number]

/** A page inside a section, shown as a tab. `key` names its label in the message file. */
export type AdminTab = { href: string; key: string }

export type AdminSection = {
  id: AdminSectionId
  href: string
  /** The section's pages, its own first. A section with one page has no tab row. */
  tabs: AdminTab[]
}

export const ADMIN_NAV: AdminSection[] = [
  { id: "overview", href: "/admin", tabs: [{ href: "/admin", key: "overview" }] },
  {
    id: "users",
    href: "/admin/users",
    tabs: [
      { href: "/admin/users", key: "accounts" },
      { href: "/admin/customers", key: "customers" },
      { href: "/admin/users/waitlist", key: "waitlist" },
    ],
  },
  { id: "documents", href: "/admin/documents", tabs: [{ href: "/admin/documents", key: "documents" }] },
  {
    id: "analytics",
    href: "/admin/analytics",
    tabs: [
      { href: "/admin/analytics", key: "growth" },
      { href: "/admin/seo", key: "seo" },
      { href: "/admin/outreach", key: "outreach" },
    ],
  },
  {
    id: "revenue",
    href: "/admin/revenue",
    tabs: [
      { href: "/admin/revenue", key: "revenueSummary" },
      { href: "/admin/revenue/reconciliation", key: "reconciliation" },
    ],
  },
  { id: "subscriptions", href: "/admin/subscriptions", tabs: [{ href: "/admin/subscriptions", key: "subscriptions" }] },
  {
    id: "health",
    href: "/admin/health",
    tabs: [
      { href: "/admin/health", key: "systemHealth" },
      { href: "/admin/moderation", key: "moderation" },
    ],
  },
  { id: "settings", href: "/admin/settings", tabs: [{ href: "/admin/settings", key: "settings" }] },
]

/** True when `pathname` is `href` or a page below it. */
function within(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * The section a URL belongs to: the one owning the longest matching tab, so
 * /admin/users/waitlist is Users and /admin is Overview only on its own.
 */
export function sectionFor(pathname: string): AdminSection | undefined {
  let best: { section: AdminSection; length: number } | undefined
  for (const section of ADMIN_NAV) {
    for (const tab of section.tabs) {
      const matches = tab.href === "/admin" ? pathname === "/admin" : within(pathname, tab.href)
      if (matches && (!best || tab.href.length > best.length)) best = { section, length: tab.href.length }
    }
  }
  return best?.section
}

/** The current tab within a section: the longest tab href the path is within. */
export function activeTab(section: AdminSection, pathname: string): AdminTab | undefined {
  return section.tabs
    .filter((tab) => (tab.href === "/admin" ? pathname === "/admin" : within(pathname, tab.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]
}
