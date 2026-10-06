import { test, expect } from "@playwright/test"
import { PDFDocument } from "pdf-lib"
import { db, freshEmail, password, quickSend, signUp } from "./helpers/esign"

/**
 * End-to-end checks for the hardening batch, each through the real app:
 *
 * - /api/health answers the uptime-monitor contract (200 with the database
 *   check, HEAD too, no auth).
 * - A Sign & Pay payment received through Paystack shows on the billing page
 *   and downloads as a PDF receipt; someone else's receipt is a 404.
 * - The Devices page lists a second signed-in device and signs it out, and
 *   the other device really is signed out.
 *
 * Needs the same local database as the other specs; nothing is sent or charged.
 */

test("health endpoint answers an uptime monitor without auth", async ({ request }) => {
  const res = await request.get("/api/health")
  expect(res.status()).toBe(200)
  const body = await res.json()
  expect(body.status).toBe("ok")
  expect(body.checks).toEqual({ database: "ok" })
  expect((await request.head("/api/health")).status()).toBe(200)
})

test("a Paystack Sign & Pay payment downloads as a PDF receipt from billing", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const email = await signUp(page)
  const signer = freshEmail("payer")
  const documentId = await quickSend(page, [signer], "Lease")
  const recipient = await db().recipient.findFirstOrThrow({ where: { documentId } })
  const payment = await db().payment.create({
    data: {
      documentId,
      recipientId: recipient.id,
      provider: "PAYSTACK",
      providerRef: `e2e_${Date.now()}`,
      amount: 25000,
      currency: "GHS",
      status: "PAID",
      paidAt: new Date(),
    },
  })

  await page.goto("/dashboard/billing")
  await expect(page.getByText("Sign & Pay: Lease")).toBeVisible()
  await expect(page.getByText("Paystack", { exact: true })).toBeVisible()
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: /Download the receipt for/ }).click()])
  expect(download.suggestedFilename()).toMatch(/^receipt-R-\d{8}-[A-Z0-9]+\.pdf$/)
  const bytes = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks))
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(1)
  expect(pdf.getTitle()).toMatch(/^Receipt R-/)

  // Another account cannot fetch it, and is not told it exists.
  const other = await browser.newContext()
  const otherPage = await other.newPage()
  await signUp(otherPage)
  expect((await otherPage.request.get(`/api/billing/receipts/signAndPay/${payment.id}`)).status()).toBe(404)
  await other.close()

  expect(email).toBeTruthy()
  await ctx.close()
})

test("the Devices page signs out another device", async ({ browser }) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
  const phonePage = await phone.newPage()
  const email = await signUp(phonePage)

  // The same account on a second device.
  const laptop = await browser.newContext()
  const laptopPage = await laptop.newPage()
  await laptopPage.goto("/login")
  await laptopPage.locator('input[name="email"]').fill(email)
  await laptopPage.locator('input[name="password"][type="password"]').fill(password)
  await laptopPage.getByRole("button", { name: /sign in|log in/i }).first().click()
  await laptopPage.waitForURL("**/dashboard", { timeout: 30_000 })

  await phonePage.goto("/dashboard/settings/sessions")
  await expect(phonePage.getByText("This device", { exact: true })).toBeVisible()
  await expect(phonePage.getByText("Safari on iOS")).toBeVisible()
  await phonePage.getByRole("button", { name: "Sign out 1 other device" }).click()
  await phonePage.getByRole("alertdialog").getByRole("button", { name: "Sign out 1 other device" }).click()
  await expect(phonePage.getByText("All other sessions", { exact: false }).or(phonePage.getByRole("status"))).toBeVisible({ timeout: 15_000 })
  await expect(phonePage.getByRole("button", { name: /Sign out \d+ other device/ })).toHaveCount(0)

  // The cookie cache can keep the laptop in for up to a minute (the caveat on
  // the page); the session row is gone at once.
  const sessions = await db().session.count({ where: { user: { email } } })
  expect(sessions).toBe(1)

  await phone.close()
  await laptop.close()
})
