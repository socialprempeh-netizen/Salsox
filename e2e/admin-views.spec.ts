import { test, expect } from "@playwright/test"
import path from "node:path"
import { db, expectNoHorizontalScroll, freshEmail, password, quickSend, signUp, tokenFor } from "./helpers/esign"

/**
 * The admin views added beside the overview: /admin/customers (what each
 * account pays, sends and collects) and /admin/moderation (accounts worth a
 * look, decline reasons, payment disputes).
 *
 * The admin sends a document and a recipient declines it with a reason, so
 * both pages have a real row to show: the sender appears among customers, and
 * the reason appears under the latest declines. Checked at phone width and on
 * a desktop, since the tables collapse into cards below `md`.
 */

test.describe.configure({ timeout: 180_000 })

// Set SCREENSHOT_DIR to also save each view for review, as responsive.spec.ts does.
const shotDir = process.env.SCREENSHOT_DIR

test("customers and moderation show real activity, on a phone and a desktop", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const email = await signUp(page)
  await db().user.update({ where: { email }, data: { role: "ADMIN" } })

  const signer = freshEmail("decliner")
  const documentId = await quickSend(page, [signer], "Moderation sample")
  const token = await tokenFor(documentId, signer)
  await db().recipient.update({
    where: { token },
    data: { signingStatus: "REJECTED", rejectionReason: "I never asked for this document" },
  })

  // The session caches the role for a minute: sign in again to carry ADMIN.
  await ctx.clearCookies()
  await page.goto("/login")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"][type="password"]').fill(password)
  await page.getByRole("button", { name: /sign in|log in/i }).first().click()
  await page.waitForURL("**/dashboard", { timeout: 20_000 })

  // Newest first: on a database with earlier test runs this account would
  // otherwise be on a later page of "most documents".
  await page.goto("/admin/customers?sort=newest")
  await expect(page.getByRole("heading", { level: 1, name: "Customers" })).toBeVisible()
  await expect(page.locator("main li", { hasText: email })).toBeVisible()
  await expectNoHorizontalScroll(page, "admin customers @360")
  if (shotDir) {
    await page.waitForTimeout(600) // let the entrance animation finish
    await page.screenshot({ path: path.join(shotDir, "360-admin-customers.png"), fullPage: true })
  }

  await page.goto("/admin/customers?sort=volume")
  await expect(page.locator('[aria-current="true"]', { hasText: "Sign & Pay payments" })).toBeVisible()

  await page.goto("/admin/moderation")
  await expect(page.getByRole("heading", { level: 1, name: "Moderation" })).toBeVisible()
  await expect(page.getByText("I never asked for this document")).toBeVisible()
  await expectNoHorizontalScroll(page, "admin moderation @360")
  if (shotDir) {
    await page.waitForTimeout(600) // let the entrance animation finish
    await page.screenshot({ path: path.join(shotDir, "360-admin-moderation.png"), fullPage: true })
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto("/admin/customers?sort=newest")
  await expect(page.locator("table").getByText(email)).toBeVisible()
  await expectNoHorizontalScroll(page, "admin customers @1280")
  if (shotDir) {
    await page.waitForTimeout(600) // let the entrance animation finish
    await page.screenshot({ path: path.join(shotDir, "1280-admin-customers.png") })
  }
  await ctx.close()
})

test("a non-admin is sent away from both views", async ({ page }) => {
  await signUp(page)
  for (const path of ["/admin/customers", "/admin/moderation"]) {
    await page.goto(path)
    await expect(page).toHaveURL(/\/dashboard$/)
  }
})
