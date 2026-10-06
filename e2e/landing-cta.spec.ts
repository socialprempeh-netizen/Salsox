import { test, expect } from "@playwright/test"

/**
 * The landing page's calls to action start the product (src/lib/landing-cta.ts).
 *
 * Both used to point at the pricing section, so "Get started" and "Send your
 * first document" scrolled a visitor down to billing. This checks the real
 * page, on a phone and on a desktop, that both now lead to sign up.
 */

test("on a phone, 'Send your first document' opens sign up", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto("/")
  const cta = page.getByRole("link", { name: "Send your first document" })
  await expect(cta).toHaveAttribute("href", "/signup")
  await cta.click()
  await page.waitForURL("**/signup")
  await ctx.close()
})

test("on a desktop, 'Get started' in the navigation opens sign up", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  const getStarted = page.getByRole("link", { name: "Get started" })
  await expect(getStarted).toHaveAttribute("href", "/signup")
  await getStarted.click()
  await page.waitForURL("**/signup")
})

// The landing page is static and rendered for a signed-out visitor; a signed-in
// one gets the swap after hydration (src/components/landing/session-aware.tsx).
test("signed in, the landing page offers the dashboard and a new document", async ({ browser }) => {
  const { signUp } = await import("./helpers/esign")
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await ctx.newPage()
  await signUp(page)
  await page.goto("/")
  await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Get started" })).toHaveCount(0)
  await expect(page.getByRole("link", { name: "Send your first document" })).toHaveAttribute("href", "/dashboard/documents/new")

  // And on a phone, the menu carries the Dashboard link instead of Sign in.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Open menu" }).click()
  // The grouped menu is a full-screen panel of links now, not a dropdown of menu items.
  // await expect(page.getByRole("menuitem", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("link", { name: "Dashboard" })).toBeVisible()
  await ctx.close()
})
