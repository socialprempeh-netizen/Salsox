import { test, expect } from "@playwright/test"
import path from "node:path"
import { expectNoHorizontalScroll, freshEmail, quickSend, signUp, tokenFor } from "./helpers/esign"

/**
 * Mobile responsiveness: every main surface at two common phone widths must
 * fit without horizontal scrolling. 360px is the narrowest widely used
 * Android width; 390px is a current iPhone.
 *
 * Set SCREENSHOT_DIR to also save a full-page screenshot of each for review.
 */

const WIDTHS = [360, 390]
const shotDir = process.env.SCREENSHOT_DIR

test.describe.configure({ timeout: 180_000 })

for (const width of WIDTHS) {
  test(`all main pages fit a ${width}px phone`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()

    const check = async (url: string, name: string) => {
      await page.goto(url)
      await page.waitForLoadState("networkidle")
      await expectNoHorizontalScroll(page, `${name} @${width}`)
      if (shotDir) await page.screenshot({ path: path.join(shotDir, `${width}-${name}.png`), fullPage: true })
    }

    await check("/", "landing")
    await check("/pricing", "pricing")
    await check("/about", "about")
    await check("/contact", "contact")
    await check("/blog", "blog")
    await check("/docs", "docs")
    await check("/changelog", "changelog")
    await check("/this-page-does-not-exist", "not-found")
    await check("/privacy", "privacy")
    await check("/terms", "terms")
    await check("/cookies", "cookies")
    await check("/login", "login")
    // SEO pages: every free tool, a page of each other kind, the hubs and a
    // guide with a comparison table, so a wide table or a long tool toolbar
    // cannot push the page sideways.
    for (const path of [
      "/sign-pdf",
      "/add-signature-to-pdf",
      "/fill-and-sign-pdf",
      "/request-signature",
      "/pdf-signature-generator",
      "/online-esignature",
      "/free-esignature",
      "/compare/docusign",
      "/alternatives/docusign",
      "/esignature-for/real-estate",
      "/tools",
      "/compare",
      "/esignature-for",
      "/blog/how-to-sign-a-pdf",
      "/docs/getting-started",
    ]) {
      await check(path, path.slice(1).replaceAll("/", "-"))
    }
    // Public document verification: the empty form, and an answer for a code
    // that matches nothing (the result card has to fit too).
    await check("/verify", "verify")
    await check("/verify?code=AAAA-BBBB-CCCC", "verify-not-found")

    await signUp(page)
    const signerEmail = freshEmail("mobile")
    const documentId = await quickSend(page, [signerEmail])

    await check("/dashboard", "dashboard")
    await check("/dashboard/documents", "documents")
    await check("/dashboard/documents/quick-send", "quick-send")
    await check("/dashboard/documents/new", "new-document")
    await check(`/dashboard/documents/${documentId}`, "document-detail")
    await check("/dashboard/billing", "billing")
    await check("/dashboard/payouts", "payouts")
    await check("/dashboard/settings", "settings")
    await check("/dashboard/settings/sessions", "devices")

    const token = await tokenFor(documentId, signerEmail)
    await check(`/sign/${token}`, "sign-intro")
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Review and sign" }).click()
    await expect(page.locator("canvas").first()).toBeVisible()
    await expectNoHorizontalScroll(page, `sign-document @${width}`)
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${width}-sign-document.png`) })

    await page.getByRole("button", { name: "Start" }).click()
    await expect(page.getByRole("tab", { name: "Draw" })).toBeVisible()
    await expectNoHorizontalScroll(page, `sign-sheet @${width}`)
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${width}-sign-sheet.png`) })

    await ctx.close()
  })
}
