import { test, expect, type Page } from "@playwright/test"
import path from "node:path"
import fs from "node:fs"
import sharp from "sharp"
import { db, giveBusinessPlan, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"

/**
 * Screenshots of the real signing flow for the blog (public/blog/screens/),
 * taken from the running app rather than drawn, so a guide shows exactly
 * what a reader will see:
 *
 *   BLOG_SCREENSHOTS=1 npx playwright test e2e/blog-screenshots.spec.ts --project=chromium
 *
 * Skipped in the normal suite. A throwaway sender (Business plan, so the
 * sealed certificate and audit trail appear) Quick Sends a generated
 * agreement; the signer opens the link on a phone-sized screen. Signing
 * links are masked; the people are fictional (example.com addresses, IPs
 * from the 203.0.113.0/24 documentation range), and the sender's account is
 * deleted before and after the run. Next's development badge is hidden.
 * Run it again after a UI change and commit the new images.
 */

const SENDER = "ama.mensah@example.com"
const SIGNER = "kofi.boateng@example.com"
const removeSender = () => db().user.deleteMany({ where: { email: SENDER } })

/** Hides Next's development indicator, which is not part of the product. */
const hideDevBadge = (page: Page) => page.addStyleTag({ content: "nextjs-portal{display:none!important}" })

const OUT = path.join(process.cwd(), "public", "blog", "screens")
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.42" } }

/** Anything showing a signing link, hidden before a screenshot. */
const linkMasks = (page: Page) => [page.locator('input[value*="/sign/"]'), page.locator('a[href*="/sign/"]:not([href$="/download"])')]

test.skip(!process.env.BLOG_SCREENSHOTS, "set BLOG_SCREENSHOTS=1 to refresh the blog's screenshots")

test("blog screenshots of the signing flow", async ({ browser }) => {
  test.setTimeout(240_000)
  fs.mkdirSync(OUT, { recursive: true })

  // Sender, on a laptop-sized screen.
  await removeSender()
  const senderCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" } })
  const sender = await senderCtx.newPage()
  await giveBusinessPlan(await signUp(sender, SENDER))

  // Quick Send, filled in, before sending.
  const signerEmail = SIGNER
  await sender.goto("/dashboard/documents/quick-send")
  await hideDevBadge(sender)
  await sender.locator('input[type="file"]').setInputFiles({ name: "Website design agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() })
  await sender.getByLabel("Who needs to sign?").fill(SIGNER)
  await sender.waitForTimeout(500)
  await sender.locator("main").screenshot({ path: path.join(OUT, "quick-send.png") })

  // The real send goes to a throwaway address the test owns.
  const documentId = await quickSend(sender, [signerEmail], "Website design agreement")
  await expect(sender.getByText("Awaiting signatures")).toBeVisible()
  // No screenshot of the sent document: a test run sends no email, so the
  // page shows the "share the links manually" notice a production
  // deployment, which does send invitations, never shows.

  // The signer, on a phone.
  const signerCtx = await browser.newContext(phone)
  const signer = await signerCtx.newPage()
  await signer.goto(`/sign/${await tokenFor(documentId, signerEmail)}`)
  await expect(signer.getByRole("heading", { name: "Website design agreement" })).toBeVisible()
  await hideDevBadge(signer)
  await signer.waitForTimeout(500)
  await signer.screenshot({ path: path.join(OUT, "phone-signing-start.png") })

  await signer.getByRole("checkbox").check()
  await signer.getByRole("button", { name: "Review and sign" }).click()
  // The page behind the dialog shows the document once it has rendered.
  await expect(signer.locator("canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(signer.getByText("Loading document…")).toHaveCount(0)
  await hideDevBadge(signer)
  await signer.getByRole("button", { name: "Start" }).click()
  await signer.getByRole("tab", { name: "Type" }).click()
  await signer.waitForTimeout(500)
  await signer.screenshot({ path: path.join(OUT, "phone-adopt-signature.png") })
  await signer.getByRole("button", { name: "Adopt and sign" }).click()
  await expect(signer.getByText("1 of 2 done")).toBeVisible()
  await signer.getByRole("button", { name: /Next field/ }).click()
  await signer.getByRole("button", { name: "Save" }).click()
  await expect(signer.getByText("2 of 2 done")).toBeVisible()
  await signer.waitForTimeout(500)
  await signer.screenshot({ path: path.join(OUT, "phone-fields-done.png") })
  await signer.getByRole("button", { name: "Finish signing" }).click()
  await expect(signer.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })
  await signer.waitForTimeout(500)
  await signer.screenshot({ path: path.join(OUT, "phone-signed.png") })

  // Back to the sender: the completed document and its audit trail.
  await sender.goto(`/dashboard/documents/${documentId}`)
  await expect(sender.getByText(/Completed/).first()).toBeVisible({ timeout: 30_000 })
  await hideDevBadge(sender)
  await sender.waitForTimeout(800)
  await sender.locator("main").screenshot({ path: path.join(OUT, "document-completed.png"), mask: linkMasks(sender) })
  // The audit trail alone, for posts about evidence and validity.
  // The nearest container holding both the heading and the trail's first event.
  await sender
    .getByRole("heading", { name: "Audit trail" })
    .locator("xpath=ancestor::*[.//*[contains(text(), 'Document uploaded')]][1]")
    .screenshot({ path: path.join(OUT, "audit-trail.png") })

  await signerCtx.close()
  await senderCtx.close()
  await removeSender()

  // The phone screens side by side on the site's cream, so a post shows the
  // whole flow at a readable size instead of one tall screenshot per step.
  const shots = ["phone-signing-start.png", "phone-adopt-signature.png", "phone-signed.png"]
  const width = 600, gap = 48, pad = 48
  const resized = await Promise.all(shots.map((f) => sharp(path.join(OUT, f)).resize({ width }).png().toBuffer()))
  const heights = await Promise.all(resized.map(async (b) => (await sharp(b).metadata()).height ?? 0))
  const height = Math.max(...heights)
  await sharp({ create: { width: pad * 2 + width * 3 + gap * 2, height: pad * 2 + height, channels: 3, background: "#efe9e3" } })
    .composite(resized.map((input, i) => ({ input, left: pad + i * (width + gap), top: pad })))
    .png()
    .toFile(path.join(OUT, "phone-signing-flow.png"))
})
