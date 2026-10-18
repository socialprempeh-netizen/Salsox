import { test, expect, type Page } from "@playwright/test"
import { expectNoHorizontalScroll } from "./helpers/esign"

/**
 * The analytics consent banner and Google Analytics' Consent Mode setup
 * (src/components/analytics). Runs only when the server has
 * NEXT_PUBLIC_GA_MEASUREMENT_ID set, since without it neither exists.
 *
 * Google's hosts are stubbed: the suite never sends a hit to a real GA
 * property. What GA would receive is read from `window.dataLayer` instead.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim()
test.skip(!GA_ID, "NEXT_PUBLIC_GA_MEASUREMENT_ID is not set")

async function stubGoogle(page: Page) {
  await page.route(/googletagmanager\.com|google-analytics\.com/, (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "" }))
}

/** The dataLayer as plain arrays (gtag pushes `arguments` objects). */
async function dataLayer(page: Page): Promise<unknown[][]> {
  return page.evaluate(() => ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? []).map((a) => Array.from(a)))
}

for (const width of [360, 390]) {
  test(`banner fits a ${width}px phone and records the choice`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await stubGoogle(page)
    await page.goto("/")
    const banner = page.getByRole("region", { name: "Analytics cookies" })
    await expect(banner).toBeVisible({ timeout: 10_000 })
    const box = await banner.boundingBox()
    expect(box!.width).toBeLessThanOrEqual(width)
    await expectNoHorizontalScroll(page, `consent banner @${width}`)
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/${width}-consent.png` })

    // Denied by default, before any choice.
    const before = await dataLayer(page)
    expect(before).toContainEqual(["consent", "default", expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" })])

    await banner.getByRole("button", { name: "Accept" }).tap()
    await expect(banner).toBeHidden()
    expect(await dataLayer(page)).toContainEqual(["consent", "update", { analytics_storage: "granted" }])

    // Remembered: no banner on the next page, and the grant goes in at start.
    await page.goto("/pricing")
    await page.waitForTimeout(3500)
    await expect(page.getByRole("region", { name: "Analytics cookies" })).toHaveCount(0)
    expect(await dataLayer(page)).toContainEqual(["consent", "update", { analytics_storage: "granted" }])
    await ctx.close()
  })
}

const pageViews = async (page: Page) => (await dataLayer(page)).filter((e) => e[0] === "event" && e[1] === "page_view")

test("a page view leaves the token out of the address", async ({ page }) => {
  await stubGoogle(page)
  await page.goto("/reset-password?token=secret-token-123&utm_source=dm")
  await expect.poll(async () => (await pageViews(page)).length).toBe(1)
  const [view] = await pageViews(page)
  expect(JSON.stringify(await dataLayer(page))).not.toContain("secret-token-123")
  expect((view[2] as { page_location: string }).page_location).toMatch(/\/reset-password\?utm_source=dm$/)
})

test("client-side navigation sends its own page view", async ({ page }) => {
  await stubGoogle(page)
  await page.goto("/")
  await expect.poll(async () => (await pageViews(page)).length).toBe(1)
  await page.locator('footer a[href="/about"]').click()
  await page.waitForURL("**/about")
  await expect.poll(async () => (await pageViews(page)).length).toBe(2)
  const [, second] = await pageViews(page)
  expect((second[2] as { page_location: string }).page_location).toMatch(/\/about$/)
})

test("no banner and no GA on a signing page", async ({ page }) => {
  await stubGoogle(page)
  await page.goto("/sign/not-a-real-token")
  await page.waitForTimeout(3500)
  await expect(page.getByRole("region", { name: "Analytics cookies" })).toHaveCount(0)
  expect(await dataLayer(page)).toEqual([])
})

test("Cookie settings in the footer reopens the banner", async ({ page }) => {
  await stubGoogle(page)
  await page.goto("/")
  const banner = page.getByRole("region", { name: "Analytics cookies" })
  await banner.getByRole("button", { name: "Decline" }).click({ timeout: 10_000 })
  await expect(banner).toBeHidden()
  await page.getByRole("button", { name: "Cookie settings" }).click()
  await expect(banner).toBeVisible()
})
