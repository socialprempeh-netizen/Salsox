import { test, expect } from "@playwright/test"
import path from "node:path"
import { db, expectNoHorizontalScroll, password, signUp } from "./helpers/esign"

/**
 * The outreach tracker (/admin/outreach): an admin adds a conversation, sees
 * it in the list, moves it to "Replied" from the list, and the change survives
 * a reload. Checked at both phone widths (cards) and on a desktop (the table),
 * so neither layout scrolls sideways.
 */

test.describe.configure({ timeout: 180_000 })

// Set SCREENSHOT_DIR to also save each view for review, as responsive.spec.ts does.
const shotDir = process.env.SCREENSHOT_DIR

test("an admin tracks a conversation, on a phone and a desktop", async ({ browser }) => {
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

  const name = `Prospect ${Date.now()}`
  await page.goto("/admin/outreach")
  await expect(page.getByRole("heading", { level: 1, name: "Outreach" })).toBeVisible()

  await page.getByRole("button", { name: "Add conversation" }).click()
  await page.getByLabel("Name").fill(name)
  await page.getByLabel("Company").fill("Test Realty")
  await page.getByLabel("Channel").selectOption("REDDIT")
  await page.getByLabel("Notes").fill("Asked about WhatsApp sending")
  await page.locator("form").getByRole("button", { name: "Add conversation" }).click()
  await expect(page.getByText("Conversation added")).toBeVisible()

  // Other runs leave rows behind: narrow to this one.
  await page.getByLabel("Search conversations").fill(name)
  const card = page.locator("main li", { hasText: name })
  await expect(card).toBeVisible()
  await card.getByLabel(`Status for ${name}`).selectOption("REPLIED")
  await expect.poll(async () => (await db().outreachContact.findFirst({ where: { name } }))?.status).toBe("REPLIED")

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await page.reload()
    await expect(page.getByRole("heading", { level: 1, name: "Outreach" })).toBeVisible()
    await expectNoHorizontalScroll(page, `admin outreach @${width}`)
    if (shotDir) {
      await page.waitForTimeout(600) // let the entrance animation finish
      await page.screenshot({ path: path.join(shotDir, `${width}-admin-outreach.png`), fullPage: true })
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.reload()
  await page.getByLabel("Search conversations").fill(name)
  const row = page.locator("table tr", { hasText: name })
  await expect(row).toBeVisible()
  await expect(row.getByLabel(`Status for ${name}`)).toHaveValue("REPLIED")
  await expectNoHorizontalScroll(page, "admin outreach @1280")
  if (shotDir) {
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(shotDir, "1280-admin-outreach.png"), fullPage: true })
  }

  await db().outreachContact.deleteMany({ where: { name } })
  await ctx.close()
})
