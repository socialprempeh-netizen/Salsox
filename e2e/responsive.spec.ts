import { test, expect } from "@playwright/test"
import path from "node:path"
import { expectNoHorizontalScroll, freshEmail, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"

/**
 * Mobile responsiveness: every main surface at two common phone widths must
 * fit without horizontal scrolling. 360px is the narrowest widely used
 * Android width; 390px is a current iPhone.
 *
 * Set SCREENSHOT_DIR to also save a full-page screenshot of each for review.
 */

const WIDTHS = [360, 390]
const shotDir = process.env.SCREENSHOT_DIR

// Was 180_000: joining the affiliate program to check its dashboard pushed
// a cold dev server (every page compiled on first visit) past it.
test.describe.configure({ timeout: 240_000 })

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
    // Was /docs: it redirects to the Help Center, checked below.
    await check("/changelog", "changelog")
    await check("/this-page-does-not-exist", "not-found")
    await check("/privacy", "privacy")
    await check("/terms", "terms")
    await check("/cookies", "cookies")
    await check("/login", "login")
    // Sign-up through an invite link, with the invited person's notice. The
    // cookie is cleared after, so the account made below is not an invitee.
    await check("/invite/abcd2345", "signup-invited")
    await expect(page.getByText("You were invited")).toBeVisible()
    await ctx.clearCookies({ name: "sx_ref" })
    // The OAuth consent page, with a client this deployment does not know:
    // the explanation card, which never redirects.
    await check("/oauth/authorize?client_id=unknown&response_type=code", "oauth-invalid")
    // "Check your email": after a sign-in link, and after sign-up now that an
    // address must be confirmed before the account can be used.
    await check("/verify-request", "verify-request")
    await check("/verify-request?reason=signup", "verify-request-signup")
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
      "/vs/docusign",
      "/alternatives/docusign",
      "/esignature-for/real-estate",
      "/vs/signnow",
      "/vs/getaccept",
      // Competitor and feature pages: a comparison table, a roundup table,
      // a feature page with benefits, and an audience page.
      "/vs/adobe-acrobat-sign",
      "/alternatives/pandadoc",
      "/sign-and-pay",
      "/esignature-for/enterprises",
      "/templates",
      "/templates/statement-of-work",
      "/tools",
      "/compare",
      "/esignature-for",
      "/integrations",
      "/integrations/zapier",
      "/integrations/google-drive",
      "/integrations/make",
      "/integrations/gmail",
      "/integrations/slack",
      // Where the API stands: rewritten when the send API shipped.
      "/esignature-api",
      // The e-signature law hub (the SEO agent's law pages are added from
      // the database, so only the hub is here).
      "/esignature-law",
      "/blog/how-to-sign-a-pdf",
      // Was "/docs/getting-started": now a redirect to a Help Center guide.
      // The Help Center: its front page, a guide with a table, and the videos.
      "/resources/help",
      "/resources/help/plans-and-what-they-include",
      "/resources/help/videos",
      // The public webhook and API reference that integrations link to.
      "/resources/help/webhooks-and-api",
      // Its no-code companion, with a JSON request block that must not push the page sideways.
      "/resources/help/connect-zapier-or-make",
      // The privacy URL the Chrome Web Store listing points at.
      "/resources/help/orphan-page-scanner-privacy",
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
    await check("/dashboard/referrals", "referrals")
    await check("/dashboard/affiliate", "affiliate")
    // Join, so the affiliate dashboard itself (link, commission, chart) is
    // checked too, not only the join form.
    await page.locator("#affiliate-code").fill(`e2e-${Date.now().toString(36)}`)
    await page.locator('input[type="checkbox"]').check()
    await page.locator('button[type="submit"]').click()
    await page.locator("#affiliate-earnings-title").waitFor({ timeout: 15_000 })
    await check("/dashboard/affiliate", "affiliate-dashboard")
    // 2FA and passkeys, on their own page since the Security split.
    await check("/dashboard/security", "security")
    // Webhooks and API keys (src/lib/webhooks).
    await check("/dashboard/developers", "developers")
    // The Chrome extension's sign-in question (any extension id passes in
    // development; elsewhere this shows the "not from the extension" card).
    await check("/extension/connect?redirect_uri=https%3A%2F%2Fabcdefghijklmnopabcdefghijklmnop.chromiumapp.org%2Fconnected", "extension-connect")
    await check("/dashboard/settings", "settings")
    await check("/dashboard/settings/sessions", "devices")

    // The editor's Sign & Pay step, where the processing-fee note sits.
    await page.goto("/dashboard/documents/new")
    await page.locator('input[type="file"]').setInputFiles({ name: "Lease.pdf", mimeType: "application/pdf", buffer: await samplePdf(1) })
    await page.getByRole("button", { name: "Continue to recipients" }).click()
    await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
    await page.getByLabel("Name").fill("Kofi Boateng")
    await page.getByLabel("Email").fill(freshEmail("editor"))
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByText(/processing fee comes out of what you receive, at cost/)).toBeVisible()
    await expectNoHorizontalScroll(page, `editor-sign-and-pay @${width}`)
    if (shotDir) await page.screenshot({ path: path.join(shotDir, `${width}-editor-sign-and-pay.png`), fullPage: true })

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
