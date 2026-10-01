import { test, expect, type Page } from "@playwright/test"
import { db, expectNoHorizontalScroll, freshEmail, giveBusinessPlan, quickSend, samplePdf, signUp } from "./helpers/esign"

/**
 * The plan gates (src/lib/esign/plans.ts), as a sender meets them:
 *
 * - a free account sees its monthly allowance, and Business controls in the
 *   editor (signing order, approvers, Sign & Pay) are locked with an upgrade
 *   note instead of quietly working;
 * - the fourth document of the month is refused, with an "Upgrade" button,
 *   and is not sent;
 * - on Business the same controls are open.
 *
 * Phone width throughout, since that is where the notes have the least room.
 * The Business account is given a subscription row directly
 * (`giveBusinessPlan`): checkout is covered by checkout.spec.ts, and this is
 * about what the plan unlocks.
 */

test.describe.configure({ timeout: 180_000 })

const phone = { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true }

/** Uploads a PDF from the new-document page and lands in its editor. */
async function openEditor(page: Page) {
  await page.goto("/dashboard/documents/new")
  await page.locator('input[type="file"]').setInputFiles({ name: "Lease.pdf", mimeType: "application/pdf", buffer: await samplePdf(1) })
  await page.getByRole("button", { name: "Continue to recipients" }).click()
  await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
  await page.getByLabel("Name").fill("Kofi Boateng")
  await page.getByLabel("Email").fill(freshEmail("plan"))
}

test("a free account sees its allowance and the Business controls locked", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await signUp(page)

  await page.goto("/dashboard/documents/new")
  await expect(page.getByText("3 of 3 free documents left this month")).toBeVisible()
  await expectNoHorizontalScroll(page, "new document, free")

  await openEditor(page)
  await expect(page.getByLabel("Sign in order")).toBeDisabled()
  await expect(page.getByText("Included in the Business plan.").first()).toBeVisible()
  await expect(page.locator("option", { hasText: "Approves (Business)" })).toBeDisabled()
  await expectNoHorizontalScroll(page, "editor recipients, free")

  await page.getByRole("button", { name: "Next", exact: true }).click()
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByLabel("Sign & Pay")).toBeDisabled()
  await expect(page.getByRole("link", { name: "Upgrade" }).first()).toHaveAttribute("href", "/dashboard/billing")
  await expectNoHorizontalScroll(page, "editor review, free")
  await ctx.close()
})

test("the fourth document of the month is refused with an upgrade, and not sent", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  const email = await signUp(page)
  for (let i = 1; i <= 3; i++) await quickSend(page, [freshEmail(`free${i}`)], `Doc ${i}`)

  await page.goto("/dashboard/documents/quick-send")
  await expect(page.getByText("You've sent your 3 free documents this month")).toBeVisible()
  await expectNoHorizontalScroll(page, "quick send, allowance spent")

  await page.locator('input[type="file"]').setInputFiles({ name: "Doc 4.pdf", mimeType: "application/pdf", buffer: await samplePdf() })
  await page.getByLabel("Who needs to sign?").fill(freshEmail("free4"))
  await page.getByRole("button", { name: /^Send to/ }).click()
  await expect(page.getByText(/sent your 3 free documents this month\. Upgrade to Personal/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Upgrade" })).toBeVisible()

  const user = await db().user.findUniqueOrThrow({ where: { email } })
  expect(await db().document.count({ where: { userId: user.id, sentAt: { not: null } } })).toBe(3)
  await ctx.close()
})

test("on Business the same controls are open", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await giveBusinessPlan(await signUp(page))

  await page.goto("/dashboard/documents/new")
  await expect(page.getByText(/free documents left/)).toHaveCount(0)
  await openEditor(page)
  await expect(page.getByLabel("Sign in order")).toBeEnabled()
  await expect(page.getByText("Included in the Business plan.")).toHaveCount(0)
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await page.getByRole("button", { name: "Next", exact: true }).click()
  await expect(page.getByLabel("Sign & Pay")).toBeEnabled()
  await ctx.close()
})
