import { test, expect } from "@playwright/test"
import { expectNoHorizontalScroll } from "./helpers/esign"

/**
 * The Help Center (/resources/help, src/lib/help.ts), as a visitor meets it:
 *
 * - reached from the Resources menu, on a laptop and from the phone menu;
 * - the front page lists every topic, and its search finds a guide as you
 *   type and says so when nothing matches;
 * - a guide draws its numbered steps as steps, continuing the count after a
 *   heading, and links on to the next guide;
 * - the video tutorials page has a card per topic, "Coming soon", with the
 *   recording script hidden until it is opened.
 *
 * Phone widths are checked for sideways scroll here and in responsive.spec.ts.
 */

test("the Resources menu leads to the Help Center", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/", { waitUntil: "networkidle" })
  const nav = page.getByRole("navigation").first()
  await nav.getByRole("button", { name: "Resources" }).click()
  await nav.getByRole("link", { name: /^Help Center/ }).click()
  await page.waitForURL("**/resources/help")
  await expect(page.getByRole("heading", { level: 1, name: "How can we help?" })).toBeVisible()
})

test("the phone menu leads to the Help Center", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto("/", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Open menu" }).click()
  await page.getByRole("button", { name: /^Resources$/ }).click()
  // In the open menu: the footer lists the same link too.
  await page.getByRole("dialog").getByRole("link", { name: /^Help Center/ }).click()
  await page.waitForURL("**/resources/help")
  await ctx.close()
})

for (const width of [360, 390]) {
  test(`front page, search, a guide and the videos at ${width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto("/resources/help")

    // Every topic, each with its guides.
    for (const topic of ["Getting started", "Sending a document", "Placing fields and signing", "Templates", "Sign & Pay", "Account and billing", "Security and audit trail", "Troubleshooting"]) {
      await expect(page.getByRole("heading", { level: 3, name: topic, exact: true })).toBeVisible()
    }
    await expectNoHorizontalScroll(page, `help center @${width}`)

    // Search as you type, in any word order.
    const search = page.getByRole("searchbox", { name: "Search the Help Center" })
    await search.fill("paystack connect")
    await expect(page.getByText("1 guide", { exact: true })).toBeVisible()
    await expect(page.getByRole("link", { name: /Connect Stripe or Paystack to get paid/ }).first()).toBeVisible()
    await search.fill("zzzz")
    await expect(page.getByText(/No guide matches that/)).toBeVisible()
    await page.getByRole("button", { name: "Clear search" }).click()
    await expect(search).toHaveValue("")

    // A guide: its steps are numbered and keep counting after a heading.
    await page.goto("/resources/help/send-a-document-step-by-step")
    await expect(page.getByRole("heading", { level: 1, name: "Send a document step by step" })).toBeVisible()
    const lists = page.locator("article ol.help-steps")
    await expect(lists).toHaveCount(3)
    await expect(lists.nth(1)).toHaveAttribute("style", /counter-reset:\s*help-step 5/)
    const marker = await lists.first().locator("li").first().evaluate((li) => getComputedStyle(li, "::before").content)
    expect(marker).toContain("counter")
    await expect(page.getByRole("link", { name: /Next.*Add recipients and choose their roles/ })).toBeVisible()
    await expectNoHorizontalScroll(page, `help article @${width}`)

    // A guide with a table keeps it inside the page.
    await page.goto("/resources/help/plans-and-what-they-include")
    await expect(page.getByRole("table")).toBeVisible()
    await expectNoHorizontalScroll(page, `help article with a table @${width}`)

    // The videos: a card per topic, coming soon, scripts closed until opened.
    await page.goto("/resources/help/videos")
    await expect(page.getByText("Coming soon", { exact: true })).toHaveCount(8)
    const scripts = page.getByRole("button", { name: /Recording script/ })
    await expect(scripts).toHaveCount(8)
    await expect(scripts.first()).toHaveAttribute("aria-expanded", "false")
    // Closed, the script is in the page but collapsed and inert.
    const region = page.locator(`[id="${await scripts.first().getAttribute("aria-controls")}"]`)
    await expect(region).toHaveAttribute("inert", "")
    expect((await region.boundingBox())?.height ?? 0).toBe(0)
    await scripts.first().click()
    await expect(scripts.first()).toHaveAttribute("aria-expanded", "true")
    await expect(region).not.toHaveAttribute("inert", "")
    await expect(region.getByText("Before you record")).toBeInViewport()
    await expectNoHorizontalScroll(page, `help videos @${width}`)
    await ctx.close()
  })
}

test("an unknown guide is a 404", async ({ page }) => {
  const response = await page.goto("/resources/help/not-a-guide")
  expect(response?.status()).toBe(404)
})
