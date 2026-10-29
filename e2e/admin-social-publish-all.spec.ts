import { test, expect } from "@playwright/test"
import path from "node:path"
import { db, expectNoHorizontalScroll, password, signUp } from "./helpers/esign"

/**
 * "Publish all pending drafts" in the social studio (/admin/outreach/social):
 * the button shows its plan first, with a platform known to be failing (here
 * X, whose last attempt was refused for empty API credit) skipped with that
 * reason in plain words, and the drafts on working platforms marked to
 * publish. The confirm button is never pressed: this test publishes nothing.
 * Run the app with dummy social tokens anyway, so nothing could reach a real
 * account. Checked at both phone widths for sideways scrolling.
 */

test.describe.configure({ timeout: 180_000 })

const shotDir = process.env.SCREENSHOT_DIR
const X_CREDIT = "X API credit is empty, add credit in the X Developer Console."

test("publish-all shows its plan and skips a failing platform, without publishing", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const email = await signUp(page)
  await db().user.update({ where: { email }, data: { role: "ADMIN" } })

  // The session caches the role for a minute: sign in again to carry ADMIN.
  await ctx.clearCookies()
  await page.goto("/login")
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"][type="password"]').fill(password)
  // The exact name: "Sign in with a passkey" comes first on the page.
  await page.getByRole("button", { name: "Sign in", exact: true }).click()
  await page.waitForURL("**/dashboard", { timeout: 20_000 })
  // Admins need two-factor: record it as enrolled and this session as having
  // passed it, as the app does after a real authenticator code.
  const user = await db().user.update({ where: { email }, data: { twoFactorEnabled: true } })
  await db().twoFactor.create({ data: { userId: user.id, secret: "e2e", backupCodes: "e2e", verified: true } })
  await db().session.updateMany({ where: { userId: user.id }, data: { twoFactorVerifiedAt: new Date() } })

  const tag = `e2e-publish-all-${Date.now()}`
  await db().socialPost.createMany({
    data: [
      // X's last attempt was refused for credit: it is now waiting, as a draft, with the reason.
      { platform: "X", body: `${tag} an X draft that waits for credit`, status: "DRAFT", error: X_CREDIT },
      { platform: "FACEBOOK", body: `${tag} a Facebook draft ready to go`, status: "DRAFT" },
    ],
  })

  await page.goto("/admin/outreach/social")
  await page.getByRole("button", { name: "Publish all pending drafts" }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog).toBeVisible()
  const xRow = dialog.locator("li", { hasText: `${tag} an X draft` })
  await expect(xRow).toContainText("Skipped")
  await expect(xRow).toContainText(X_CREDIT)
  await expect(dialog.locator("li", { hasText: `${tag} a Facebook draft` })).toContainText("Will publish")
  await expect(dialog.getByRole("button", { name: /^Publish \d+ drafts?$/ })).toBeEnabled()

  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 })
    await expectNoHorizontalScroll(page, `publish-all dialog @${width}`)
    if (shotDir) {
      await page.waitForTimeout(400)
      await page.screenshot({ path: path.join(shotDir, `${width}-publish-all.png`) })
    }
  }

  // Closed without publishing: both drafts are still drafts.
  await dialog.getByRole("button", { name: "Cancel" }).click()
  const left = await db().socialPost.findMany({ where: { body: { startsWith: tag } }, select: { status: true } })
  expect(left.map((p) => p.status)).toEqual(["DRAFT", "DRAFT"])
  await db().socialPost.deleteMany({ where: { body: { startsWith: tag } } })
})
