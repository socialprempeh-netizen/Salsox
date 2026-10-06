import { test, expect } from "@playwright/test"
import path from "node:path"
import { expectNoHorizontalScroll } from "./helpers/esign"

/**
 * The public site's grouped navigation (src/lib/site-nav.ts): the desktop
 * dropdowns, the phone menu at 360px and 390px, and the footer columns. Each
 * must reach the free tools, the comparisons and the resources, and the
 * phone menu must fit the screen.
 *
 * Set SCREENSHOT_DIR to also save screenshots of the open menus for review.
 */

const shotDir = process.env.SCREENSHOT_DIR

test("desktop: each group opens a panel that reaches its pages and its hub", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await page.goto("/", { waitUntil: "networkidle" })
  const nav = page.getByRole("navigation", { name: "Main" })

  const tools = nav.getByRole("button", { name: "Free tools" })
  await tools.click()
  await expect(tools).toHaveAttribute("aria-expanded", "true")
  for (const name of ["Sign PDF", "Add signature to PDF", "Fill and sign PDF", "Request a signature", "Signature generator", "All free tools"]) {
    await expect(nav.getByRole("link", { name: new RegExp(`^${name}`) })).toBeVisible()
  }
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "nav-desktop-tools.png") })

  // Escape closes and hands focus back to the trigger.
  await page.keyboard.press("Escape")
  await expect(tools).toHaveAttribute("aria-expanded", "false")
  await expect(tools).toBeFocused()

  // Only one panel at a time.
  await nav.getByRole("button", { name: "Compare" }).click()
  await expect(nav.getByRole("link", { name: "vs DocuSign" })).toBeVisible()
  await expect(nav.getByRole("link", { name: /^Sign PDF/ })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "All comparisons" })).toHaveAttribute("href", "/compare")

  await nav.getByRole("button", { name: /^Why / }).click()
  await expect(nav.getByText("What you can do")).toBeVisible()
  await expect(nav.getByText("Use cases", { exact: true })).toBeVisible()
  if (shotDir) await page.screenshot({ path: path.join(shotDir, "nav-desktop-why.png") })

  await nav.getByRole("button", { name: "Resources" }).click()
  await nav.getByRole("link", { name: /^Help and docs/ }).click()
  await page.waitForURL("**/docs")
  // A followed link closes the panel.
  await expect(nav.getByRole("link", { name: /^Help and docs/ })).toHaveCount(0)
  await expect(nav.getByRole("link", { name: "Pricing" })).toHaveAttribute("href", "/pricing")
  await ctx.close()
})

for (const width of [360, 390]) {
  test(`phone menu at ${width}px: grouped, fits the screen, and closes on navigation`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto("/", { waitUntil: "networkidle" })

    await page.getByRole("button", { name: "Open menu" }).click()
    const menu = page.getByRole("dialog", { name: "Main" })
    await expect(menu).toBeVisible()
    for (const name of [/^Why /, /^Free tools$/, /^Compare$/, /^Resources$/]) {
      await expect(menu.getByRole("button", { name })).toBeVisible()
    }
    await expect(menu.getByRole("link", { name: "Pricing" })).toBeVisible()
    await expect(menu.getByRole("link", { name: "Sign in" })).toBeVisible()

    await menu.getByRole("button", { name: "Free tools" }).click()
    await expect(menu.getByRole("link", { name: "All free tools" })).toBeVisible()
    await expectNoHorizontalScroll(page, `open phone menu @${width}`)
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `nav-phone-${width}.png`) })

    await menu.getByRole("button", { name: "Compare" }).click()
    await expect(menu.getByRole("link", { name: "All free tools" })).toHaveCount(0)
    await menu.getByRole("link", { name: "vs DocuSign" }).click()
    await page.waitForURL("**/compare/docusign")
    await expect(page.getByRole("dialog", { name: "Main" })).toHaveCount(0)
    await expectNoHorizontalScroll(page, `after phone menu @${width}`)
    await ctx.close()
  })
}

test("footer: grouped like the top menu, with a Company column", async ({ page }) => {
  await page.goto("/tools", { waitUntil: "networkidle" })
  const footer = page.locator("footer")
  for (const heading of ["Product", "Free tools", "Compare", "Resources", "Company"]) {
    await expect(footer.getByRole("heading", { name: heading, exact: true })).toBeVisible()
  }
  await expect(footer.getByRole("link", { name: "All free tools" })).toHaveAttribute("href", "/tools")
  await expect(footer.getByRole("link", { name: "Help and docs" })).toHaveAttribute("href", "/docs")
  await expect(footer.getByRole("link", { name: "Terms of Service" })).toHaveAttribute("href", "/terms")
})
