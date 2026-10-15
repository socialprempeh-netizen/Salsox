import { test, expect } from "@playwright/test"
import path from "node:path"
import { expectNoHorizontalScroll, freshEmail, quickSend, signUp, tokenFor } from "./helpers/esign"

/**
 * The growth surfaces added together: the /vs/ comparison pages, the free
 * templates (page, hub and PDF download) and the "Signed via" card a signer
 * sees once they finish. Each is checked at both phone widths for sideways
 * scroll, as responsive.spec.ts does for the main pages.
 *
 * Set SCREENSHOT_DIR to also save each view for review.
 */

test.describe.configure({ timeout: 180_000 })

const shotDir = process.env.SCREENSHOT_DIR
const WIDTHS = [360, 390]

for (const width of WIDTHS) {
  test(`comparisons and templates fit a ${width}px phone`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    for (const [url, name, heading] of [
      ["/vs/signnow", "vs-signnow", /vs signNow/],
      ["/vs/getaccept", "vs-getaccept", /vs GetAccept/],
      ["/templates", "templates", "Free document templates"],
      ["/templates/residential-lease", "template-lease", "Residential lease agreement template"],
      ["/templates/invoice-template", "template-invoice", "Invoice template"],
    ] as const) {
      await page.goto(url)
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()
      await expectNoHorizontalScroll(page, `${name} @${width}`)
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `${width}-${name}.png`), fullPage: true })
    }
    await ctx.close()
  })
}

test("the old /compare/ URLs move permanently to /vs/", async ({ request }) => {
  for (const slug of ["docusign", "pandadoc", "dropbox-sign"]) {
    const res = await request.get(`/compare/${slug}`, { maxRedirects: 0 })
    expect(res.status()).toBe(301)
    expect(new URL(res.headers()["location"], "http://x").pathname).toBe(`/vs/${slug}`)
  }
})

test("a template page offers its PDF, its text and a way to get it signed", async ({ page, request }) => {
  await page.goto("/templates/mutual-nda")
  await expect(page.getByText("[Party A legal name]").first()).toBeVisible()
  await expect(page.getByRole("link", { name: "Get it signed free" }).first()).toHaveAttribute("href", /\/signup\?next=/)

  const href = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href")
  const pdf = await request.get(href!)
  expect(pdf.status()).toBe(200)
  expect(pdf.headers()["content-type"]).toBe("application/pdf")
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-")

  await page.context().grantPermissions(["clipboard-read", "clipboard-write"])
  await page.getByRole("button", { name: "Copy text" }).click()
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible()

  expect((await request.get("/api/templates/not-a-template/pdf")).status()).toBe(404)
})

test("a signer who finishes sees the Signed via card, on both phone widths", async ({ browser }) => {
  const senderCtx = await browser.newContext()
  const sender = await senderCtx.newPage()
  await signUp(sender)
  const signerEmail = freshEmail("viral")
  const documentId = await quickSend(sender, [signerEmail])
  const token = await tokenFor(documentId, signerEmail)

  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const signer = await ctx.newPage()
  await signer.goto(`/sign/${token}`)
  await signer.getByRole("checkbox").check()
  await signer.getByRole("button", { name: "Review and sign" }).click()
  await signer.getByRole("button", { name: "Start" }).click()
  await signer.getByRole("tab", { name: "Type" }).click()
  await signer.getByRole("button", { name: "Adopt and sign" }).click()
  await signer.getByRole("button", { name: /Next field/ }).click()
  await signer.getByRole("button", { name: "Save" }).click()
  await signer.getByRole("button", { name: "Finish signing" }).click()
  await expect(signer.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })

  const card = signer.getByRole("complementary", { name: /Signed via/ })
  await expect(card).toBeVisible()
  const cta = card.getByRole("link", { name: /Try .+ free/ })
  await expect(cta).toHaveAttribute("href", /utm_campaign=signed_via/)

  for (const width of WIDTHS) {
    await signer.setViewportSize({ width, height: 800 })
    await signer.reload()
    await expect(card).toBeVisible()
    await expectNoHorizontalScroll(signer, `signed-via @${width}`)
    if (shotDir) {
      await signer.waitForTimeout(900) // let the card's entrance finish
      await signer.screenshot({ path: path.join(shotDir, `${width}-signed-via.png`), fullPage: true })
    }
  }

  // The card leads where it says: signup, then straight to Quick Send.
  await cta.click()
  await signer.waitForURL(/\/signup/)
  await ctx.close()
  await senderCtx.close()
})
