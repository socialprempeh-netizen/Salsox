import { test, expect } from "@playwright/test"
import { PDFDocument } from "pdf-lib"
import { db, freshEmail, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"

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
  await signUp(sender)
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
  await expect(page.getByText(/new link sent/i)).toBeVisible()

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
  await expect(page.getByText("Links renewed and resent.")).toBeVisible()

  const document = await db().document.findUniqueOrThrow({ where: { id: documentId }, include: { recipients: true } })
  expect(document.status).toBe("PENDING")
  expect(document.recipients[0].expiresAt!.getTime()).toBeGreaterThan(Date.now())

  // Same link as before now works again.
  await signer.reload()
  await expect(signer.getByRole("button", { name: "Review and sign" })).toBeVisible()
  await ctx.close()
})
