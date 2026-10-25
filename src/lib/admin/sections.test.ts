/**
 * Tests for the admin console map (sections.ts): eight sections, every admin
 * page on disk reachable from one of them, and URLs highlighting the right
 * section and tab.
 */
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { activeTab, ADMIN_NAV, ADMIN_SECTIONS, sectionFor } from "./sections"

/** Every admin route with a page.tsx, as a URL path. */
function adminPages(): string[] {
  const root = path.join(process.cwd(), "src", "app", "(admin)")
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === "page.tsx") out.push("/" + path.relative(root, dir).split(path.sep).join("/"))
    }
  }
  walk(root)
  return out
}

describe("the admin console map", () => {
  it("has exactly the eight sections, in order", () => {
    expect(ADMIN_NAV.map((s) => s.id)).toEqual([...ADMIN_SECTIONS])
    expect(ADMIN_NAV).toHaveLength(9)
  })

  it("puts every admin page on disk in a section, so none is unreachable", () => {
    const tabs = new Set(ADMIN_NAV.flatMap((s) => s.tabs.map((t) => t.href)))
    // A detail page (a dynamic segment, like /admin/seo/agent/[id]) is not a
    // tab of its own: it is reached from the tab it sits under, which must be one.
    const reachable = (page: string) => tabs.has(page) || (/\[[^\]]+\]/.test(page) && tabs.has(page.replace(/\/\[[^\]]+\].*$/, "")))
    for (const page of adminPages()) expect(reachable(page), page).toBe(true)
  })

  it("keeps the pages that existed before the reorganisation", () => {
    for (const href of ["/admin/customers", "/admin/moderation", "/admin/seo", "/admin/outreach"]) {
      expect(sectionFor(href), href).toBeDefined()
    }
    expect(sectionFor("/admin/customers")?.id).toBe("users")
    expect(sectionFor("/admin/moderation")?.id).toBe("health")
    expect(sectionFor("/admin/seo")?.id).toBe("analytics")
    expect(sectionFor("/admin/outreach")?.id).toBe("analytics")
  })

  it("matches Overview only on /admin itself, and the deepest tab elsewhere", () => {
    expect(sectionFor("/admin")?.id).toBe("overview")
    expect(sectionFor("/admin/users/waitlist")?.id).toBe("users")
    const users = ADMIN_NAV.find((s) => s.id === "users")!
    expect(activeTab(users, "/admin/users/waitlist")?.key).toBe("waitlist")
    expect(activeTab(users, "/admin/users")?.key).toBe("accounts")
    const revenue = ADMIN_NAV.find((s) => s.id === "revenue")!
    expect(activeTab(revenue, "/admin/revenue/reconciliation")?.key).toBe("reconciliation")
    const analytics = ADMIN_NAV.find((s) => s.id === "analytics")!
    expect(sectionFor("/admin/outreach/agent")?.id).toBe("analytics")
    expect(activeTab(analytics, "/admin/outreach/agent")?.key).toBe("outreachAgent")
    expect(activeTab(analytics, "/admin/outreach")?.key).toBe("outreach")
  })
})
