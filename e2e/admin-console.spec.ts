import { test, expect } from "@playwright/test"
import fs from "node:fs"
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
  ["/admin/analytics/traffic", /^Traffic$/],
  ["/admin/seo", /./],
  ["/admin/seo/inventory", /^SEO inventory$/],
  ["/admin/seo/agent", /^SEO agent$/],
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
  await analyticsTabs.getByRole("link", { name: "SEO inventory" }).click()
  await page.waitForURL("**/admin/seo/inventory")

  // The SEO inventory is built from the sitemap and the page data: a
  // comparison carries its keyword, the type filter narrows the list, and the
  // CSV holds every page whatever is filtered.
  const inventory = page.locator("main")
  await inventory.getByRole("tab", { name: /^Comparison/ }).click()
  await expect(inventory.getByRole("link", { name: "/vs/docuseal" })).toBeVisible()
  await expect(inventory.getByRole("link", { name: "/sign-and-pay" })).toHaveCount(0)
  await inventory.getByRole("tab", { name: /^All/ }).click()
  await inventory.getByRole("searchbox", { name: "Search pages" }).fill("sign-and-pay")
  await expect(inventory.getByRole("link", { name: "/sign-and-pay" })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent("download"), inventory.getByRole("button", { name: "Download CSV" }).click()])
  const csv = fs.readFileSync(await download.path(), "utf8")
  expect(csv.split("\n")[0]).toBe("url,type,keyword,intent,status,title,aliases,locale,updated")
  expect(csv).toMatch(/\/vs\/docuseal,comparison,/)
  expect(csv).toMatch(/\/templates\/[a-z-]+,template,/)
  await expectNoHorizontalScroll(page, "seo inventory after filtering")

  // The IndexNow log under it: a submission shows its trigger, status and
  // result, and opens to list its URLs. Seeded here because a test server is
  // not a public https origin, so it never sends a real one.
  const ping = await db().indexNowPing.create({ data: { trigger: "deploy", urlCount: 2, urls: ["https://salsox.com/vs/docuseal", "https://salsox.com/sign-and-pay"], status: 403, ok: false, error: null } })
  await page.reload()
  const log = page.locator("section", { has: page.getByRole("heading", { name: "IndexNow submissions" }) })
  await expect(log).toBeVisible()
  await expect(log.getByText("Not accepted").first()).toBeVisible()
  await log.getByRole("button", { name: "2 URLs" }).first().click()
  await expect(log.getByText("/vs/docuseal").first()).toBeVisible()
  await expectNoHorizontalScroll(page, "indexnow log opened")
  await db().indexNowPing.delete({ where: { id: ping.id } })

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

// Was "the footer links to the X and LinkedIn pages", against guessed
// placeholder addresses. Each of the six networks now shows either way: a
// link to the configured profile (NEXT_PUBLIC_*_URL), or an inert icon
// announced as coming soon, never a link to an address nobody set. The store
// badges are inert placeholders until a store URL is set.
test("the footer shows every social icon, linked only when its profile is set", async ({ page }) => {
  await page.goto("/")
  const footer = page.locator("footer")
  const networks: [string, string, RegExp][] = [
    ["YouTube", "NEXT_PUBLIC_YOUTUBE_URL", /^https:\/\/(www\.)?youtube\.com\//],
    ["Instagram", "NEXT_PUBLIC_INSTAGRAM_URL", /^https:\/\/(www\.)?instagram\.com\//],
    ["TikTok", "NEXT_PUBLIC_TIKTOK_URL", /^https:\/\/(www\.)?tiktok\.com\//],
    ["Facebook", "NEXT_PUBLIC_FACEBOOK_URL", /^https:\/\/(www\.)?facebook\.com\//],
    ["Pinterest", "NEXT_PUBLIC_PINTEREST_URL", /^https:\/\/([a-z]+\.)?pinterest\.[a-z.]+\//],
    ["LinkedIn", "NEXT_PUBLIC_LINKEDIN_URL", /^https:\/\/(www\.)?linkedin\.com\//],
    ["X / Twitter", "NEXT_PUBLIC_X_URL", /^https:\/\/(x|twitter)\.com\//],
  ]
  for (const [name, env, href] of networks) {
    if (process.env[env]) {
      await expect(footer.getByRole("link", { name })).toHaveAttribute("href", href)
    } else {
      await expect(footer.getByRole("link", { name })).toHaveCount(0)
      await expect(footer.getByRole("img", { name: `${name} (coming soon)` })).toBeVisible()
    }
  }
  if (!process.env.NEXT_PUBLIC_APP_STORE_URL) {
    await expect(footer.getByRole("img", { name: "Download on the App Store (Mobile apps coming soon)" })).toBeVisible()
    await expect(footer.getByText("Mobile apps coming soon", { exact: true })).toBeVisible()
  }
  // The badges, icons and logo mark are the supplied artwork's web copies
  // (public/brand/web, made by scripts/brand-web-assets.mjs).
  for (const src of ["/badges/app-store-badge.svg", "/brand/web/badge-google-play.png", "/brand/web/icon-pinterest.png", "/brand/web/logo-mark.png"]) {
    expect((await page.request.get(src)).status(), src).toBe(200)
  }
})
