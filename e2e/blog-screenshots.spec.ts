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

/**
 * Batch 2 (October 2026): the screens the second set of posts needs, taken
 * fresh: the Share menu with WhatsApp and SMS, the editor with signing order
 * and an approver, correcting a recipient, a signer declining with a reason,
 * the declined document as the sender sees it, and the public verification
 * result. Same fictional people and documentation IPs as above. Crops stay
 * inside the relevant card or dialog, so the local "email isn't configured"
 * notice (a test run sends no email) never appears.
 */
test("blog screenshots, batch 2", async ({ browser }) => {
  test.setTimeout(300_000)
  fs.mkdirSync(OUT, { recursive: true })
  await removeSender()
  const senderCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" } })
  const sender = await senderCtx.newPage()
  await giveBusinessPlan(await signUp(sender, SENDER))
  // The Recipients card: the nearest container holding its heading and the
  // recipient's buttons. Measured while nothing is open: an open menu hides
  // the rest of the page from the accessibility tree.
  const card = (heading: string) =>
    sender.getByRole("heading", { name: heading }).locator("xpath=ancestor::*[.//button[contains(., 'Share')]][1]")

  // The editor: an approver first, then two clients signing at the same
  // step, then the sender countersigning. (Was three people, one per step,
  // before recipients could share a step.)
  await sender.goto("/dashboard/documents/new")
  await sender.locator('input[type="file"]').setInputFiles({ name: "Supply agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() })
  await sender.getByRole("button", { name: "Continue to recipients" }).click()
  await sender.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
  const people = [
    ["Efua Mensah", "efua.mensah@example.com", "APPROVER"],
    ["Kofi Boateng", SIGNER, "SIGNER"],
    ["Yaw Boateng", "yaw.boateng@example.com", "SIGNER"],
    ["Ama Mensah", SENDER, "SIGNER"],
  ] as const
  for (let i = 0; i < people.length; i++) {
    if (i > 0) await sender.getByRole("button", { name: "Add recipient" }).click()
    await sender.getByLabel("Name").nth(i).fill(people[i][0])
    await sender.getByLabel("Email").nth(i).fill(people[i][1])
    await sender.getByLabel("Role").nth(i).selectOption(people[i][2])
  }
  await sender.getByLabel("Sign in order (one after another)").check()
  await sender.getByLabel("Sign at the same time as step 2").check()
  await expect(sender.getByRole("list", { name: "Signing steps" }).getByRole("listitem")).toHaveCount(3)
  await hideDevBadge(sender)
  // The dashboard's sticky top bar would land mid-image in a scrolled capture.
  const hideTopBar = await sender.addStyleTag({ content: "header{position:static!important}" })
  await sender.waitForTimeout(500)
  await sender.locator("main").screenshot({ path: path.join(OUT, "editor-signing-order.png") })
  await hideTopBar.evaluate((el) => (el as Element).remove())

  // A Quick Send document to share, correct and have declined.
  const documentId = await quickSend(sender, [SIGNER], "Kitchen refit quote")
  // A test run sends no email, so the invitation is recorded as delivered,
  // the state a production send leaves, and the page shows its real status
  // instead of the local "share the link manually" notice.
  await db().recipient.updateMany({ where: { documentId }, data: { sentAt: new Date() } })
  await sender.reload()
  await hideDevBadge(sender)
  const recipients = card("Recipients")

  // The Share menu: WhatsApp, SMS and copy, beside the recipient.
  const cardBox = (await recipients.boundingBox())!
  await sender.getByRole("button", { name: "Share" }).first().click()
  await sender.getByRole("menuitem", { name: /WhatsApp/ }).waitFor()
  const menuBox = (await sender.getByRole("menu").boundingBox())!
  const left = Math.min(menuBox.x, cardBox.x) - 8, right = Math.max(menuBox.x + menuBox.width, cardBox.x + cardBox.width)
  const top = Math.min(menuBox.y, cardBox.y), bottom = Math.max(menuBox.y + menuBox.height, cardBox.y + cardBox.height) + 8
  await sender.screenshot({ path: path.join(OUT, "share-link-menu.png"), clip: { x: left, y: top, width: right - left, height: bottom - top } })
  await sender.keyboard.press("Escape")

  // Correcting a recipient: the edit dialog.
  await sender.getByRole("button", { name: "Edit" }).click()
  await sender.getByLabel("Email").fill("kofi@boatengstudio.example")
  await sender.waitForTimeout(400)
  await sender.getByRole("dialog").screenshot({ path: path.join(OUT, "edit-recipient.png") })
  await sender.keyboard.press("Escape")

  // The signer declines, with a reason, on a phone.
  const signerCtx = await browser.newContext(phone)
  const signer = await signerCtx.newPage()
  await signer.goto(`/sign/${await tokenFor(documentId, SIGNER)}`)
  await hideDevBadge(signer)
  await signer.getByRole("button", { name: "Decline to sign" }).or(signer.getByRole("link", { name: "Decline to sign" })).first().click()
  await signer.getByPlaceholder("Reason (optional)").fill("The start date should be 3 November, not 27 October.")
  await signer.waitForTimeout(400)
  await signer.screenshot({ path: path.join(OUT, "phone-decline.png") })
  await signer.getByRole("button", { name: "Decline", exact: true }).click()
  await signer.waitForTimeout(800)

  // What the sender sees afterwards.
  await sender.reload()
  await hideDevBadge(sender)
  await expect(sender.getByText(/Declined/).first()).toBeVisible({ timeout: 30_000 })
  await sender
    .getByRole("heading", { name: "Recipients" })
    .locator("xpath=ancestor::*[.//*[contains(text(), 'Declined')]][1]")
    .screenshot({ path: path.join(OUT, "recipient-declined.png") })

  // A completed document, then its public verification page on a phone.
  const signedId = await quickSend(sender, [SIGNER], "Logo design agreement")
  await signer.goto(`/sign/${await tokenFor(signedId, SIGNER)}`)
  await signer.getByRole("checkbox").check()
  await signer.getByRole("button", { name: "Review and sign" }).click()
  await signer.getByRole("button", { name: "Start" }).click()
  await signer.getByRole("tab", { name: "Type" }).click()
  await signer.getByRole("button", { name: "Adopt and sign" }).click()
  await signer.getByRole("button", { name: /Next field/ }).click()
  await signer.getByRole("button", { name: "Save" }).click()
  await signer.getByRole("button", { name: "Finish signing" }).click()
  await expect(signer.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })
  let code: string | null = null
  for (let i = 0; i < 30 && !code; i++) {
    code = (await db().document.findUniqueOrThrow({ where: { id: signedId } })).verificationCode
    if (!code) await signer.waitForTimeout(1000)
  }
  await signer.goto(`/verify?code=${code}`)
  await expect(signer.getByRole("heading", { name: "Genuine signed document" })).toBeVisible()
  await hideDevBadge(signer)
  await signer.waitForTimeout(400)
  await signer.locator("main").screenshot({ path: path.join(OUT, "phone-verify.png") })

  await signerCtx.close()
  await senderCtx.close()
  await removeSender()
})
