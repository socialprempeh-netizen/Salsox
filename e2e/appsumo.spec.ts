import { test, expect } from "@playwright/test"
import { createHmac, randomUUID } from "node:crypto"
import { db, expectNoHorizontalScroll, freshEmail, password, signUp } from "./helpers/esign"

/**
 * AppSumo lifetime deals, end to end (src/lib/appsumo.ts): a license that
 * AppSumo's webhooks reported active is redeemed from the dashboard, unlocks
 * the plan everywhere the plan gates read it, and a signed refund webhook
 * takes it away again. Also: a key entered while signed out survives sign-up,
 * and the pages fit a phone.
 *
 * The dev server runs with APPSUMO_API_KEY set to the value below
 * (playwright.config.ts), so the webhooks here are signed exactly as AppSumo
 * signs them. No call reaches AppSumo: every license is reported by webhook
 * first, which is what makes the API lookup unnecessary.
 */

// Sign-ups and several page visits per test, on a dev server that compiles
// each page on first visit: the 30s default is not enough.
test.describe.configure({ timeout: 120_000 })

const API_KEY = process.env.E2E_APPSUMO_API_KEY ?? "e2e-appsumo-api-key"
const created: string[] = []

async function webhook(request: import("@playwright/test").APIRequestContext, body: object) {
  const raw = JSON.stringify(body)
  const timestamp = String(Date.now())
  const signature = createHmac("sha256", API_KEY).update(timestamp + raw).digest("hex")
  return request.post("/api/webhooks/appsumo", { data: raw, headers: { "content-type": "application/json", "x-appsumo-timestamp": timestamp, "x-appsumo-signature": signature } })
}

/** A license AppSumo has sold and the buyer has activated, as its webhooks would leave it. */
async function activatedLicense(request: import("@playwright/test").APIRequestContext, tier: number): Promise<string> {
  const key = randomUUID()
  created.push(key)
  for (const event of ["purchase", "activate"]) {
    const res = await webhook(request, { license_key: key, event, license_status: "inactive", tier, event_timestamp: Date.now(), created_at: Date.now(), test: false, extra: { reason: "e2e" } })
    expect(res.status()).toBe(200)
    expect(await res.json()).toEqual({ event, success: true })
  }
  return key
}

test.afterAll(async () => {
  await db().appSumoLicense.deleteMany({ where: { licenseKey: { in: created } } })
})

test("an unsigned webhook is refused and changes nothing", async ({ request }) => {
  const res = await request.post("/api/webhooks/appsumo", { data: { license_key: randomUUID(), event: "activate", tier: 2, event_timestamp: Date.now() } })
  expect(res.status()).toBe(401)
})

test("the OAuth landing page answers 200 without redirecting", async ({ request }) => {
  const res = await request.get("/redeem", { maxRedirects: 0 })
  expect(res.status()).toBe(200)
})

test("redeem Business, then a refund downgrades the account", async ({ page, request }) => {
  const key = await activatedLicense(request, 2)
  await signUp(page, freshEmail("appsumo"))

  // Free to begin with: the monthly allowance shows before sending.
  await page.goto("/dashboard/documents/quick-send")
  await expect(page.getByText(/free documents left this month/)).toBeVisible()

  await page.goto("/dashboard/redeem")
  await page.getByLabel("License key").fill(key.toUpperCase())
  await page.getByRole("button", { name: "Redeem license" }).click()
  await expect(page.getByText("Lifetime plan unlocked")).toBeVisible()
  await expect(page.getByText("Business", { exact: true }).first()).toBeVisible()

  // The plan gates read it: no allowance, and billing says where the plan comes from.
  await page.goto("/dashboard/documents/quick-send")
  await expect(page.getByText(/free documents left this month/)).toHaveCount(0)
  await page.goto("/dashboard/billing")
  await expect(page.getByText("Lifetime Business plan from AppSumo is active on this account.")).toBeVisible()

  // Refunded on AppSumo: the deactivation arrives, and the plan is gone.
  const refund = await webhook(request, { license_key: key, event: "deactivate", license_status: "deactivated", tier: 2, event_timestamp: Date.now(), created_at: Date.now(), test: false, extra: { reason: "Refunded by the customer" } })
  expect(refund.status()).toBe(200)
  await page.goto("/dashboard/documents/quick-send")
  await expect(page.getByText(/free documents left this month/)).toBeVisible()
  await page.goto("/dashboard/redeem")
  await expect(page.getByText(/Refunded by the customer/)).toBeVisible()
})

test("an upgrade on AppSumo moves the account to the new key", async ({ page, request }) => {
  const oldKey = await activatedLicense(request, 1)
  await signUp(page, freshEmail("appsumo-up"))
  await page.goto("/dashboard/redeem")
  await page.getByLabel("License key").fill(oldKey)
  await page.getByRole("button", { name: "Redeem license" }).click()
  await expect(page.getByText("Lifetime plan unlocked")).toBeVisible()

  const newKey = randomUUID()
  created.push(newKey)
  const now = Date.now()
  // Deactivation of the old key first: the order is not promised.
  expect((await webhook(request, { license_key: oldKey, event: "deactivate", license_status: "deactivated", tier: 1, event_timestamp: now, created_at: now, test: false, extra: { reason: "Upgraded by the customer" } })).status()).toBe(200)
  expect((await webhook(request, { license_key: newKey, prev_license_key: oldKey, event: "upgrade", license_status: "inactive", tier: 2, event_timestamp: now + 1, created_at: now, test: false, extra: { reason: "Upgraded by the customer" } })).status()).toBe(200)

  await page.goto("/dashboard/billing")
  await expect(page.getByText("Lifetime Business plan from AppSumo is active on this account.")).toBeVisible()
})

test("a key entered signed out is redeemed after sign-up", async ({ page, request }) => {
  const key = await activatedLicense(request, 1)
  await page.goto("/redeem")
  await page.getByLabel("License key").fill(key)
  await page.getByRole("button", { name: "Continue" }).click()
  await expect(page.getByText("License key saved")).toBeVisible()

  // Signed up by hand: signUp() waits for /dashboard, which this account
  // never shows, because the dashboard layout goes straight on to redeem it.
  await page.goto("/signup")
  await page.getByPlaceholder("you@example.com").fill(freshEmail("appsumo-later"))
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()
  await page.waitForURL(/\/dashboard\/redeem\?result=redeemed/, { timeout: 30_000 })
  await expect(page.getByText("Your AppSumo license is redeemed: Personal is unlocked for life.")).toBeVisible()

  // A second account cannot take the same key.
  await page.context().clearCookies()
  await signUp(page, freshEmail("appsumo-thief"))
  await page.goto("/dashboard/redeem")
  await page.getByLabel("License key").fill(key)
  await page.getByRole("button", { name: "Redeem license" }).click()
  await expect(page.getByText("This license is already redeemed by another account.")).toBeVisible()
})

for (const width of [360, 390]) {
  test(`the redeem pages fit a ${width}px phone`, async ({ browser, request }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto("/redeem")
    await expectNoHorizontalScroll(page, `redeem @${width}`)
    await page.getByLabel("License key").fill("not-a-key")
    await page.getByRole("button", { name: "Continue" }).click()
    await expectNoHorizontalScroll(page, `redeem-error @${width}`)

    const key = await activatedLicense(request, 2)
    await signUp(page, freshEmail("appsumo-phone"))
    await page.goto("/dashboard/redeem")
    await expectNoHorizontalScroll(page, `dashboard-redeem @${width}`)
    await page.getByLabel("License key").fill(key)
    await page.getByRole("button", { name: "Redeem license" }).click()
    await expect(page.getByText("Lifetime plan unlocked")).toBeVisible()
    await expectNoHorizontalScroll(page, `dashboard-redeem-done @${width}`)
    await page.goto("/dashboard/billing")
    await expectNoHorizontalScroll(page, `billing-appsumo @${width}`)
    await ctx.close()
  })
}
