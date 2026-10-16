import { test, expect } from "@playwright/test"
import { expectNoHorizontalScroll } from "./helpers/esign"

/**
 * The hero "Get started" email row (src/components/landing/email-capture.tsx)
 * on the home page and a landing page: the field and the button sit on one
 * line from a 390px phone up, submitting opens the real signup page with the
 * address filled in and the hero's destination kept, and the page never
 * scrolls sideways. A value that is not an email is not echoed into the form.
 */

for (const [path, location] of [["/", "home"], ["/sign-and-pay", "landing"]] as const) {
  test(`${location}: the email row prefills signup`, async ({ page }) => {
    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      const field = page.locator("main").getByRole("textbox", { name: "Your email address" })
      const button = page.locator("main").getByRole("button", { name: "Get started" })
      await expect(field).toBeVisible()
      await expect(button).toBeVisible()
      // Full height at every width, stacked or not: the field once collapsed
      // to its text line when the row stacked below 380px.
      const [fh, bh] = [(await field.boundingBox())!.height, (await button.boundingBox())!.height]
      expect(fh, `field height @${width}`).toBeGreaterThanOrEqual(44)
      expect(Math.abs(fh - bh), `field and button the same height @${width}`).toBeLessThan(2)
      if (width >= 390) {
        const [f, b] = [await field.boundingBox(), await button.boundingBox()]
        expect(Math.abs((f?.y ?? 0) - (b?.y ?? 1)), `same row @${width}`).toBeLessThan(2)
      }
      await expectNoHorizontalScroll(page, `${path} email row @${width}`)
    }

    await page.locator("main").getByRole("textbox", { name: "Your email address" }).fill("ama.mensah@example.com")
    await page.locator("main").getByRole("button", { name: "Get started" }).click()
    await page.waitForURL("**/signup?**")
    const url = new URL(page.url())
    expect(url.searchParams.get("email")).toBe("ama.mensah@example.com")
    expect(url.searchParams.get("next")).toMatch(/^\/dashboard/)
    await expect(page.locator('input[name="email"]')).toHaveValue("ama.mensah@example.com")
  })
}

test("signup ignores a value that is not an email", async ({ page }) => {
  await page.goto("/signup?email=%3Cscript%3E")
  await expect(page.locator('input[name="email"]')).toHaveValue("")
})
