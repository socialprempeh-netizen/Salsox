import { test, expect } from "@playwright/test"
import { PDFDocument } from "pdf-lib"
import { db, expectNoHorizontalScroll, freshEmail, giveBusinessPlan, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"

/**
 * The core promise, end to end: a sender Quick Sends a PDF, the signer signs
 * it on a phone, and everyone can download the sealed result. Plus the two
 * fixes for DocuSign's most common complaints: correcting a wrong email, and
 * reviving an expired document, both without rebuilding anything.
 *
 * No email is sent (the server runs without a Resend key) and no payment is
 * taken, so this is safe to run repeatedly.
 */

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

test.describe.configure({ timeout: 90_000 })

test("Quick Send → sign on a phone → sealed PDF with certificate", async ({ browser }) => {
  const senderCtx = await browser.newContext()
  const sender = await senderCtx.newPage()
  // The certificate page asserted below is a Business feature.
  await giveBusinessPlan(await signUp(sender))
  const signerEmail = freshEmail("signer")
  const documentId = await quickSend(sender, [signerEmail])
  await expect(sender.getByText("Awaiting signatures")).toBeVisible()
  const token = await tokenFor(documentId, signerEmail)

  const signerCtx = await browser.newContext(phone)
  const signer = await signerCtx.newPage()
  await signer.goto(`/sign/${token}`)

  // Intro and consent.
  await expect(signer.getByRole("heading", { name: "Service agreement" })).toBeVisible()
  await signer.getByRole("checkbox").check()
  await signer.getByRole("button", { name: "Review and sign" }).click()

  // Field 1: signature, typed.
  await signer.getByRole("button", { name: "Start" }).click()
  await signer.getByRole("tab", { name: "Type" }).click()
  await signer.getByRole("button", { name: "Adopt and sign" }).click()
  await expect(signer.getByText("1 of 2 done")).toBeVisible()

  // Field 2: date, prefilled with today.
  await signer.getByRole("button", { name: /Next field/ }).click()
  await signer.getByRole("button", { name: "Save" }).click()
  await expect(signer.getByText("2 of 2 done")).toBeVisible()

  await signer.getByRole("button", { name: "Finish signing" }).click()
  await expect(signer.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })

  const document = await db().document.findUniqueOrThrow({ where: { id: documentId } })
  expect(document.status).toBe("COMPLETED")
  expect(document.sealedKey).toBeTruthy()

  // The signer's own copy: the original's 2 pages plus the certificate page.
  const res = await signer.request.get(`/sign/${token}/download`)
  expect(res.status()).toBe(200)
  const sealed = await PDFDocument.load(await res.body())
  expect(sealed.getPageCount()).toBe(3)

  // And the sender sees it completed, with the signed download on offer.
  await sender.goto(`/dashboard/documents/${documentId}`)
  await expect(sender.getByText("Completed", { exact: true })).toBeVisible()
  await expect(sender.getByRole("link", { name: /Signed PDF/ })).toBeVisible()

  await senderCtx.close()
  await signerCtx.close()
})

test("the full editor: upload, add a recipient, tap to place a field, send (on a phone)", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await signUp(page)
  const signerEmail = freshEmail("editor")

  await page.goto("/dashboard/documents/new")
  await page.locator('input[type="file"]').setInputFiles({ name: "Lease.pdf", mimeType: "application/pdf", buffer: await samplePdf(1) })
  await page.getByRole("button", { name: "Continue to recipients" }).click()
  await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
  const documentId = page.url().split("/").at(-2)!

  await page.getByLabel("Name").fill("Kofi Boateng")
  await page.getByLabel("Email").fill(signerEmail)
  await page.getByRole("button", { name: "Next", exact: true }).click()

  // Arm the Signature tool, then tap the page.
  await page.getByRole("button", { name: "Signature", exact: true }).click()
  const pageEl = page.locator("[data-page='1']")
  // The first load of the PDF route compiles on demand in dev; allow for it.
  await expect(pageEl.locator("canvas")).toBeVisible({ timeout: 30_000 })
  // A positioned click scrolls the page into view first, like a finger would.
  const box = (await pageEl.boundingBox())!
  await pageEl.click({ position: { x: box.width / 2, y: box.height * 0.6 } })
  await expect(pageEl.getByRole("button", { name: "Signature" })).toBeVisible()

  await page.getByRole("button", { name: "Next", exact: true }).click()
  await page.getByRole("button", { name: "Send for signature" }).click()
  await page.waitForURL(/\?sent=1/, { timeout: 30_000 })

  const fields = await db().field.findMany({ where: { documentId } })
  expect(fields).toHaveLength(1)
  expect(fields[0].type).toBe("SIGNATURE")
  // Placed where it was tapped: centred on the tap point, 50% across, 60% down.
  expect(fields[0].x + fields[0].width / 2).toBeCloseTo(50, 0)
  expect(fields[0].y + fields[0].height / 2).toBeCloseTo(60, 0)
  expect((await db().document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe("PENDING")
  await ctx.close()
})

test("correcting a wrong email rotates the link without rebuilding the document", async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signUp(page)
  const wrong = freshEmail("wrong")
  const right = freshEmail("right")
  const documentId = await quickSend(page, [wrong])
  const oldToken = await tokenFor(documentId, wrong)
  const fieldsBefore = await db().field.count({ where: { documentId } })

  await page.getByRole("button", { name: "Edit" }).click()
  await page.getByLabel("Email").fill(right)
  await page.getByRole("button", { name: "Save changes" }).click()
  // This server has no Resend key, so no email carried the new link. It used
  // to say "a new link sent" anyway:
  // await expect(page.getByText(/new link sent/i)).toBeVisible()
  await expect(page.getByText(/Email isn't configured, so share the new link manually/)).toBeVisible()
  await expect(page.getByText(/new link sent/i)).toHaveCount(0)

  const newToken = await tokenFor(documentId, right)
  expect(newToken).not.toBe(oldToken)
  // Same fields, same document: nothing was rebuilt.
  expect(await db().field.count({ where: { documentId } })).toBe(fieldsBefore)
  expect((await page.request.get(`/sign/${oldToken}`)).status()).toBe(404)
  expect((await page.request.get(`/sign/${newToken}`)).status()).toBe(200)
  await ctx.close()
})

test("an expired document is revived with one click", async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await signUp(page)
  const signerEmail = freshEmail("late")
  const documentId = await quickSend(page, [signerEmail])

  // Simulate the link lapsing and the expiry sweep having run.
  await db().recipient.updateMany({ where: { documentId }, data: { expiresAt: new Date(Date.now() - 60_000) } })
  await db().document.update({ where: { id: documentId }, data: { status: "EXPIRED" } })

  const token = await tokenFor(documentId, signerEmail)
  const signer = await ctx.newPage()
  await signer.goto(`/sign/${token}`)
  await expect(signer.getByRole("heading", { name: "This link has expired" })).toBeVisible()

  await page.goto(`/dashboard/documents/${documentId}`)
  await page.getByRole("button", { name: "Renew and resend" }).click()
  // Renewed, but with no Resend key nothing was resent. It used to say so anyway:
  // await expect(page.getByText("Links renewed and resent.")).toBeVisible()
  await expect(page.getByText("Email isn't configured, so no emails were sent. Share the links manually.")).toBeVisible()

  const document = await db().document.findUniqueOrThrow({ where: { id: documentId }, include: { recipients: true } })
  expect(document.status).toBe("PENDING")
  expect(document.recipients[0].expiresAt!.getTime()).toBeGreaterThan(Date.now())

  // Same link as before now works again.
  await signer.reload()
  await expect(signer.getByRole("button", { name: "Review and sign" })).toBeVisible()
  await ctx.close()
})

/** Draws a short scribble on the signature pad, the way a finger would. */
async function scribble(page: import("@playwright/test").Page) {
  const pad = page.getByLabel("Signature drawing area")
  // The pad opens in a sheet that slides up: hovering waits for it to stop
  // moving (and scrolls it into view), so the box measured next is where the
  // canvas really is.
  await pad.hover()
  const box = (await pad.boundingBox())!
  const at = (fx: number, fy: number) => [box.x + box.width * fx, box.y + box.height * fy] as const
  await page.mouse.move(...at(0.15, 0.6))
  await page.mouse.down()
  for (const [fx, fy] of [[0.3, 0.3], [0.45, 0.7], [0.6, 0.35], [0.8, 0.6]] as const) {
    await page.mouse.move(...at(fx, fy), { steps: 6 })
  }
  await page.mouse.up()
}

/**
 * A drawn signature is an image the browser produces, and it is checked on
 * the server before it is stored (src/lib/esign/pdf/signature-image.ts): a
 * damaged one used to be accepted and then made the finished document
 * impossible to seal. This covers both sides with a real browser: a damaged
 * image is refused while the pad is still open, and the PNG a real canvas
 * produces passes the check and ends up in the sealed PDF.
 */
test("a damaged drawn signature is refused with a retry; a real one is saved and sealed (on a phone)", async ({ browser }) => {
  const senderCtx = await browser.newContext()
  const sender = await senderCtx.newPage()
  await signUp(sender)
  const signerEmail = freshEmail("signer")
  const documentId = await quickSend(sender, [signerEmail])
  const token = await tokenFor(documentId, signerEmail)

  const signerCtx = await browser.newContext(phone)
  const signer = await signerCtx.newPage()
  await signer.goto(`/sign/${token}`)
  await signer.getByRole("checkbox").check()
  await signer.getByRole("button", { name: "Review and sign" }).click()
  await signer.getByRole("button", { name: "Start" }).click()

  // Make the pad hand over half a PNG, as a flaky connection or a broken
  // browser extension might.
  await signer.evaluate(() => {
    const real = HTMLCanvasElement.prototype.toDataURL
    ;(window as unknown as { realToDataURL: typeof real }).realToDataURL = real
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      const url = real.apply(this, args)
      return url.slice(0, Math.floor(url.length / 2))
    }
  })
  await scribble(signer)
  await signer.getByRole("button", { name: "Adopt and sign" }).click()

  // Refused, said so, and the pad is still there to try again.
  await expect(signer.getByText("That signature couldn't be read, so it wasn't saved.", { exact: false })).toBeVisible()
  await expect(signer.getByLabel("Signature drawing area")).toBeVisible()
  await expect(signer.getByText("1 of 2 done")).toHaveCount(0)
  await expectNoHorizontalScroll(signer, "signing page with the signature error")
  expect(await db().signature.count({ where: { recipient: { documentId } } })).toBe(0)

  // Try again with the browser's real output.
  await signer.evaluate(() => {
    HTMLCanvasElement.prototype.toDataURL = (window as unknown as { realToDataURL: typeof HTMLCanvasElement.prototype.toDataURL }).realToDataURL
  })
  await signer.getByRole("button", { name: "Clear" }).click()
  await scribble(signer)
  await signer.getByRole("button", { name: "Adopt and sign" }).click()
  await expect(signer.getByText("1 of 2 done")).toBeVisible()

  await signer.getByRole("button", { name: /Next field/ }).click()
  await signer.getByRole("button", { name: "Save" }).click()
  await signer.getByRole("button", { name: "Finish signing" }).click()
  await expect(signer.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })

  const stored = await db().signature.findFirstOrThrow({ where: { recipient: { documentId } } })
  expect(stored.imageDataUrl).toMatch(/^data:image\/png;base64,/)
  const document = await db().document.findUniqueOrThrow({ where: { id: documentId } })
  expect(document.status).toBe("COMPLETED")
  expect(document.sealedKey).toBeTruthy()

  await senderCtx.close()
  await signerCtx.close()
})
