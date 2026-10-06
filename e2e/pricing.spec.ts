import { test, expect } from "@playwright/test"
import { expectNoHorizontalScroll } from "./helpers/esign"

/**
 * The public pricing page: every self-serve plan from the Plan table,
 * including the one-time Lifetime plan, which the page used to filter out
 * (an example "Enterprise, Custom" card stood in its place). Checked on a
 * desktop and on both phone widths, with the interval toggle in each state.
 */

for (const width of [1280, 390, 360]) {
  test(`pricing at ${width}px: Personal, Business and Lifetime, nothing hidden`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width < 1000, hasTouch: width < 1000 })
    const page = await ctx.newPage()
    await page.goto("/pricing", { waitUntil: "networkidle" })
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

    const main = page.locator("main")
    for (const plan of ["Personal", "Business", "Lifetime"]) {
      await expect(main.getByText(plan, { exact: true })).toBeVisible()
    }
    await expect(main.getByText("$299", { exact: true })).toBeVisible()
    await expect(main.getByText("one time", { exact: true })).toBeVisible()
    await expect(main.getByText("Custom", { exact: true })).toHaveCount(0)
    await expect(main.getByText("14-day free trial")).toBeVisible()

    // Yearly swaps the recurring prices; Lifetime stays as it is.
    await page.getByRole("button", { name: "Yearly" }).click()
    await expect(main.getByText(/billed yearly, \$90 a year/)).toBeVisible()
    await expect(main.getByText("$299", { exact: true })).toBeVisible()

    // Jumping to the bottom must not leave scroll-in sections invisible.
    await page.keyboard.press("End")
    await page.waitForTimeout(600)
    await expect(main.getByRole("heading", { name: "Frequently asked questions" })).toBeVisible()
    const hidden = await page.evaluate(() => [...document.querySelectorAll("main .opacity-0")].filter((el) => el.getBoundingClientRect().height > 40).length)
    expect(hidden).toBe(0)
    await expectNoHorizontalScroll(page, `pricing @${width}`)
    await ctx.close()
  })
}
