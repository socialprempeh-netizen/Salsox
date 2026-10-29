import { test, expect, type Page } from "@playwright/test"
import path from "node:path"
import { expectNoHorizontalScroll } from "./helpers/esign"

/**
 * The WordPress plugin (plugins/salsox-wordpress) in a real WordPress: the
 * visitor's form from the shortcode and from the block, and Settings >
 * Salsox, at phone widths, with square corners, plus the form's own checks.
 *
 * Needs the throwaway WordPress from plugins/salsox-wordpress/bin (see its
 * README.md), so it skips unless WP_PLUGIN_URL points at one:
 *
 *   docker compose -f plugins/salsox-wordpress/bin/docker-compose.yml up -d
 *   WP_PLUGIN_URL=http://localhost:8089 E2E_BASE_URL=http://localhost:8089 \
 *     npx playwright test e2e/wordpress-plugin.spec.ts
 *
 * WP_SHORTCODE_PAGE and WP_BLOCK_PAGE are the page IDs holding the
 * shortcode and the block (4 and 5 on a fresh install set up as described).
 * Nothing here sends a document: the site has no valid key.
 */

const wp = process.env.WP_PLUGIN_URL
const shortcodePage = process.env.WP_SHORTCODE_PAGE ?? "4"
const blockPage = process.env.WP_BLOCK_PAGE ?? "5"
const user = process.env.WP_ADMIN_USER ?? "admin"
const password = process.env.WP_ADMIN_PASSWORD ?? "local-only"
const shotDir = process.env.SCREENSHOT_DIR

test.skip(!wp, "Set WP_PLUGIN_URL to a WordPress with the plugin active")

const WIDTHS = [320, 360, 390]

async function radius(page: Page, selector: string) {
  return page.locator(selector).first().evaluate((el) => getComputedStyle(el).borderRadius)
}

async function logIn(page: Page) {
  await page.goto(`${wp}/wp-login.php`)
  await page.fill("#user_login", user)
  await page.fill("#user_pass", password)
  await page.click("#wp-submit")
  await page.waitForURL(/wp-admin/)
}

for (const width of WIDTHS) {
  test(`the form and the settings page fit a ${width}px phone`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()

    for (const [name, id] of [["shortcode", shortcodePage], ["block", blockPage]] as const) {
      await page.goto(`${wp}/?page_id=${id}`)
      await expect(page.locator(".salsox-sign__button")).toBeVisible()
      await expectNoHorizontalScroll(page, `wp ${name} @${width}`)
      for (const part of [".salsox-sign__panel", ".salsox-sign__field input", ".salsox-sign__button"]) {
        expect(await radius(page, part), `${part} is square`).toBe("0px")
      }
      // On a phone the button spans the form, a full-width target for a thumb.
      const button = await page.locator(".salsox-sign__button").boundingBox()
      const form = await page.locator(".salsox-sign__form").boundingBox()
      expect(Math.abs((button?.width ?? 0) - (form?.width ?? 0))).toBeLessThan(2)
      if (shotDir) await page.locator(".salsox-sign").first().screenshot({ path: path.join(shotDir, `${width}-wp-${name}.png`) })
    }

    await logIn(page)
    await page.goto(`${wp}/wp-admin/options-general.php?page=salsox`)
    await expect(page.getByRole("heading", { name: "Salsox", exact: true })).toBeVisible()
    await expectNoHorizontalScroll(page, `wp settings @${width}`)
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${width}-wp-settings.png`), fullPage: true })
    await ctx.close()
  })
}

test("the form checks its fields before sending", async ({ page }) => {
  await page.goto(`${wp}/?page_id=${shortcodePage}`)
  await page.click(".salsox-sign__button")
  await expect(page.locator(".salsox-sign__error")).toHaveText("Enter your full name.")
  await expect(page.locator('input[name="salsox_name"]')).toHaveAttribute("aria-invalid", "true")
  await page.fill('input[name="salsox_name"]', "Ama Mensah")
  await page.fill('input[name="salsox_email"]', "not-an-email")
  await page.click(".salsox-sign__button")
  await expect(page.locator(".salsox-sign__error")).toHaveText("Enter a valid email address.")
})

test("a tampered form is refused by the server", async ({ page }) => {
  await page.goto(`${wp}/?page_id=${shortcodePage}`)
  const token = await page.locator('input[name="salsox_form"]').inputValue()
  const nonce = await page.locator('input[name="salsox_nonce"]').inputValue()
  const [payload, mac] = token.split(".")
  const config = JSON.parse(Buffer.from(payload, "base64url").toString())
  const forged = Buffer.from(JSON.stringify({ ...config, title: "Something else" })).toString("base64url")
  const response = await page.request.post(`${wp}/?rest_route=/salsox/v1/request`, {
    data: { name: "Ama Mensah", email: "ama@example.com", form: `${forged}.${mac}`, nonce },
  })
  expect(response.status()).toBe(400)
  expect((await response.json()).message).toContain("out of date")
})

test("the hidden trap field is answered as sent, and nothing is sent", async ({ page }) => {
  await page.goto(`${wp}/?page_id=${shortcodePage}`)
  const response = await page.request.post(`${wp}/?rest_route=/salsox/v1/request`, {
    data: {
      name: "Bot",
      email: "bot@example.com",
      website: "https://spam.example",
      form: await page.locator('input[name="salsox_form"]').inputValue(),
      nonce: await page.locator('input[name="salsox_nonce"]').inputValue(),
    },
  })
  expect(response.status()).toBe(200)
})

test("the template list is for editors only", async ({ request }) => {
  const response = await request.get(`${wp}/?rest_route=/salsox/v1/templates`)
  expect(response.status()).toBe(401)
})

test("a rejected API key is reported on the settings page", async ({ page }) => {
  await logIn(page)
  await page.goto(`${wp}/wp-admin/options-general.php?page=salsox`)
  await page.fill("#salsox-key", `ak_${"x".repeat(40)}`)
  await page.click("#submit")
  await expect(page.locator(".salsox-status--bad")).toBeVisible()
  // The key field never shows a saved key back.
  await expect(page.locator("#salsox-key")).toHaveValue("")
  // A visitor sending the form now gets the plain message, not Salsox's.
  const ctx = await page.context().browser()!.newContext()
  const visitor = await ctx.newPage()
  await visitor.goto(`${wp}/?page_id=${shortcodePage}`)
  await visitor.fill('input[name="salsox_name"]', "Ama Mensah")
  await visitor.fill('input[name="salsox_email"]', "ama@example.com")
  await visitor.click(".salsox-sign__button")
  await expect(visitor.locator(".salsox-sign__error")).toHaveText("Your request could not be sent. Try again in a few minutes.")
  await ctx.close()
  // Disconnect, so the next run starts from no key.
  page.once("dialog", (d) => d.accept())
  await page.getByRole("button", { name: "Disconnect" }).click()
  await expect(page.locator(".salsox-status--off")).toBeVisible()
})
