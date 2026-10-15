import { test, expect } from "@playwright/test"
import path from "node:path"
import { db, expectNoHorizontalScroll, password, signUp } from "./helpers/esign"

/**
 * The admin console after its reorganisation into eight sections
 * (src/lib/admin/sections.ts): every section and every tab inside one opens
 * for an admin, fits a 360px and a 390px phone without sideways scroll, and
 * the pages that predate the sections are still reachable from their tabs.
 * Also checks the footer's social links.
 *
 * Set SCREENSHOT_DIR to also save each view for review.
 */

test.describe.configure({ timeout: 300_000 })

const shotDir = process.env.SCREENSHOT_DIR

const PAGES: [string, RegExp][] = [
  ["/admin", /./],
  ["/admin/users", /^Users$/],
  ["/admin/customers", /Customers/],
  ["/admin/users/waitlist", /./],
  ["/admin/documents", /^Documents$/],
  ["/admin/analytics", /^Analytics$/],
  ["/admin/seo", /./],
  ["/admin/outreach", /^Outreach$/],
  ["/admin/revenue", /^Revenue & Payments$/],
  ["/admin/revenue/reconciliation", /^Reconciliation$/],
  ["/admin/subscriptions", /^Subscriptions & Plans$/],
  ["/admin/health", /^Support & System Health$/],
  ["/admin/moderation", /Moderation/],
  ["/admin/settings", /^Settings & Security$/],
]

test("every admin section and tab opens and fits a phone", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const email = await signUp(page)
  await db().user.update({ where: { email }, data: { role: "ADMIN" } })

  // The session caches the role for a minute: sign in again to carry ADMIN.
  await ctx.clearCookies()
  await page.goto("/login")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"][type="password"]').fill(password)
  await page.getByRole("button", { name: /sign in|log in/i }).first().click()
  await page.waitForURL("**/dashboard", { timeout: 20_000 })

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    for (const [url, heading] of PAGES) {
      const res = await page.goto(url)
      expect(res?.status(), url).toBeLessThan(400)
      await expect(page.getByRole("heading", { level: 1, name: heading }), url).toBeVisible({ timeout: 30_000 })
      await expectNoHorizontalScroll(page, `${url} @${width}`)
      if (shotDir) {
        await page.waitForTimeout(500) // let the entrance animation finish
        await page.screenshot({ path: path.join(shotDir, `${width}-admin${url.replaceAll("/", "-")}.png`), fullPage: true })
      }
    }
  }

  // Tabs: the older pages are reachable from their sections.
  await page.goto("/admin/users")
  await page.getByRole("navigation", { name: "Pages in this section" }).getByRole("link", { name: "Customers" }).click()
  await page.waitForURL("**/admin/customers")
  await page.goto("/admin/health")
  await page.getByRole("navigation", { name: "Pages in this section" }).getByRole("link", { name: "Moderation" }).click()
  await page.waitForURL("**/admin/moderation")
  await page.goto("/admin/analytics")
  const analyticsTabs = page.getByRole("navigation", { name: "Pages in this section" })
  await expect(analyticsTabs.getByRole("link", { name: "SEO health" })).toBeVisible()
  await expect(analyticsTabs.getByRole("link", { name: "Outreach" })).toBeVisible()

  // The phone menu lists exactly the eight sections.
  await page.getByRole("button", { name: "Open navigation" }).click()
  const menu = page.getByRole("menu")
  for (const name of ["Overview", "Users", "Documents", "Analytics", "Revenue & Payments", "Subscriptions & Plans", "Support & System Health", "Settings & Security"]) {
    await expect(menu.getByRole("menuitem", { name })).toBeVisible()
  }
  await page.keyboard.press("Escape")

  // Desktop: the sidebar marks the section of a tab page as current.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/admin/customers")
  await expect(page.locator('aside a[aria-current="page"]')).toHaveText(/Users/)
  await page.goto("/admin/revenue")
  await expectNoHorizontalScroll(page, "revenue @1280")
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "1280-admin-revenue.png"), fullPage: true })

  await ctx.close()
})

test("the footer links to the X and LinkedIn pages", async ({ page }) => {
  await page.goto("/")
  const footer = page.locator("footer")
  await expect(footer.getByRole("link", { name: "X / Twitter" })).toHaveAttribute("href", /^https:\/\/(x|twitter)\.com\//)
  await expect(footer.getByRole("link", { name: "LinkedIn" })).toHaveAttribute("href", /^https:\/\/(www\.)?linkedin\.com\//)
})
