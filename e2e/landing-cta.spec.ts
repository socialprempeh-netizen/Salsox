import { test, expect } from "@playwright/test"

/**
 * The landing page's calls to action start the product (src/lib/landing-cta.ts).
 *
 * Both used to point at the pricing section, so "Get started" and "Send your
 * first document" scrolled a visitor down to billing. This checks the real
 * page, on a phone and on a desktop, that both now lead to sign up.
 */

// Was "on a phone, 'Send your first document' opens sign up", a link with
// href /signup?next=/dashboard/documents/quick-send. The hero's email row
// (src/components/landing/email-capture.tsx) submits to the same place, with
// the address added.
test("on a phone, the hero email row opens sign up with the address filled in", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto("/")
  const main = page.getByRole("main")
  await main.getByRole("textbox", { name: "Your email address" }).fill("ama.mensah@example.com")
  await main.getByRole("button", { name: "Get started" }).click()
  await page.waitForURL(/\/signup\?/)
  const url = new URL(page.url())
  expect(url.searchParams.get("next")).toBe("/dashboard/documents/quick-send")
  expect(url.searchParams.get("email")).toBe("ama.mensah@example.com")
  await ctx.close()
})

test("on a desktop, 'Get started' in the navigation opens sign up", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto("/")
  const getStarted = page.getByRole("link", { name: "Get started" })
  await expect(getStarted).toHaveAttribute("href", "/signup?next=/dashboard/documents/quick-send")
  await getStarted.click()
  await page.waitForURL(/\/signup\?next=/)
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
  // Was the hero button "Send your first document"; the email row shows a
  // signed-in visitor one button to a new document instead of the field.
  // await expect(page.getByRole("link", { name: "Send your first document" })).toHaveAttribute("href", "/dashboard/documents/new")
  await expect(page.getByRole("main").getByRole("link", { name: "Send a document" })).toHaveAttribute("href", "/dashboard/documents/new")
  await expect(page.getByRole("main").getByRole("textbox", { name: "Your email address" })).toHaveCount(0)

  // And on a phone, the menu carries the Dashboard link instead of Sign in.
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole("button", { name: "Open menu" }).click()
  // The grouped menu is a full-screen panel of links now, not a dropdown of menu items.
  // await expect(page.getByRole("menuitem", { name: "Dashboard" })).toBeVisible()
  await expect(page.getByRole("dialog").getByRole("link", { name: "Dashboard" })).toBeVisible()
  await ctx.close()
})
