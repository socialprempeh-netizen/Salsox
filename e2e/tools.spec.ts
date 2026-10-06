import { test, expect, type Page } from "@playwright/test"
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib"
import { freshEmail, password, samplePdf } from "./helpers/esign"

/**
 * The free PDF tools, used the way a visitor uses them, on a 360px phone:
 * each one must produce a real file, not just render. Downloads are opened
 * and checked (page count, flattened form, PNG signature), and the request
 * tool must carry its draft through signup into Quick Send.
 *
 * Nothing here is uploaded by the tools; the request tool's PDF is only
 * prefilled in Quick Send, never sent.
 */

test.describe.configure({ timeout: 180_000 })

const phone = { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }

async function formPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595, 842])
  page.drawText("Application form", { x: 60, y: 780, size: 20, font })
  const form = doc.getForm()
  form.createTextField("full_name").addToPage(page, { x: 60, y: 700, width: 240, height: 22 })
  form.createCheckBox("agree").addToPage(page, { x: 60, y: 660, width: 14, height: 14 })
  return Buffer.from(await doc.save())
}

async function downloaded(page: Page, click: () => Promise<void>): Promise<Buffer> {
  const [download] = await Promise.all([page.waitForEvent("download"), click()])
  const chunks: Buffer[] = []
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

/**
 * Taps a page of the open PDF at a point given as a fraction of its size.
 * A locator click scrolls the page into view and refuses a point covered by
 * the sticky toolbars, rather than silently tapping them instead.
 */
async function tapPage(page: Page, n: number, at = { x: 0.5, y: 0.6 }) {
  const target = page.locator(`[data-page="${n}"]`)
  const box = (await target.boundingBox())!
  await target.click({ position: { x: box.width * at.x, y: box.height * at.y } })
}

test("Sign PDF: typed signature and date, downloaded as a valid PDF", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await page.goto("/sign-pdf", { waitUntil: "networkidle" })
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign a PDF online, free")
  const original = await samplePdf(2)
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Lease.pdf", mimeType: "application/pdf", buffer: original })
  await expect(page.locator('[data-page="1"]')).toBeVisible()

  await page.getByRole("button", { name: "Signature", exact: true }).click()
  await page.getByRole("tab", { name: "Type" }).click()
  await page.getByLabel("Type your name").fill("Ama Mensah")
  await page.getByRole("button", { name: "Use this signature" }).click()
  await tapPage(page, 1)
  await page.getByRole("button", { name: "Date", exact: true }).click()
  await tapPage(page, 1, { x: 0.75, y: 0.7 })

  // A text mark is typed into where it sits, key by key: it used to accept
  // only pasted text. Re-selecting it later must still take typing.
  await page.getByRole("toolbar").getByRole("button", { name: "Text", exact: true }).click()
  await tapPage(page, 1, { x: 0.4, y: 0.3 })
  const text = page.locator('[data-page="1"]').getByPlaceholder("Text", { exact: true })
  await expect(text).toBeFocused()
  await page.keyboard.type("Ama")
  await tapPage(page, 1, { x: 0.2, y: 0.85 })
  await text.click()
  await page.keyboard.type(" Mensah")
  await expect(text).toHaveValue("Ama Mensah")

  const out = await downloaded(page, () => page.getByRole("button", { name: "Download signed PDF" }).click())
  const signed = await PDFDocument.load(out)
  expect(signed.getPageCount()).toBe(2)
  expect(out.length).toBeGreaterThan(original.length)
  await ctx.close()
})

test("Fill and sign PDF: the form's own fields are filled and flattened", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await page.goto("/fill-and-sign-pdf", { waitUntil: "networkidle" })
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Form.pdf", mimeType: "application/pdf", buffer: await formPdf() })
  await expect(page.getByText("This PDF has 2 fillable fields")).toBeVisible()
  // Filled on the page itself, where the form's field sits; the list below
  // the document shows the same value. An accented name and the cedi sign
  // used to make the download fail (the form font cannot encode them).
  await page.locator('[data-page="1"]').getByLabel("full_name").click()
  await page.keyboard.type("Kọ́fí Owusu ₵")
  await page.locator('[data-page="1"]').getByLabel("agree").check()
  await expect(page.locator("input[value='Kọ́fí Owusu ₵']")).toHaveCount(2)

  const out = await downloaded(page, () => page.getByRole("button", { name: "Download signed PDF" }).click())
  const filled = await PDFDocument.load(out)
  expect(filled.getForm().getFields()).toHaveLength(0)
  await ctx.close()
})

test("Signature generator: a transparent PNG, handed to Add signature to PDF and placed on every page", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await page.goto("/pdf-signature-generator", { waitUntil: "networkidle" })
  await page.getByRole("tab", { name: "Type" }).click()
  await page.getByLabel("Your name").fill("Ama Mensah")

  const png = await downloaded(page, () => page.getByRole("button", { name: "Download PNG" }).click())
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a")

  await page.getByRole("button", { name: "Use it to sign a PDF" }).click()
  await page.waitForURL("**/add-signature-to-pdf")
  await page.waitForLoadState("networkidle")
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Contract.pdf", mimeType: "application/pdf", buffer: await samplePdf(3) })
  // The generated signature arrived: no pad to fill in.
  await expect(page.getByRole("button", { name: "Change signature" })).toBeVisible()
  // Placed on page 2, not page 1: every page gets it either way. Repeating
  // used to copy only marks that sat on page 1.
  await page.getByRole("button", { name: "Signature", exact: true }).click()
  await tapPage(page, 2)
  await page.getByText("Repeat on every page", { exact: true }).click()
  await expect(page.locator('[data-page="3"] [aria-label="Signature"]')).toHaveCount(1)

  const out = await downloaded(page, () => page.getByRole("button", { name: "Download signed PDF" }).click())
  expect((await PDFDocument.load(out)).getPageCount()).toBe(3)
  await ctx.close()
})

/**
 * A finger stroke across the drawing area, sent as raw touch events (the
 * only way to drag a finger in Playwright). Chrome's harness never turns the
 * first tap after such a drag into a click, on any page, so one throwaway
 * tap follows; a person's taps are unaffected.
 */
async function fingerDraw(page: Page, area: ReturnType<Page["locator"]>) {
  const box = (await area.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  const at = (i: number) => [{ x: box.x + box.width * (0.15 + 0.035 * i), y: box.y + box.height * (0.5 + 0.2 * Math.sin(i / 3)), id: 1, radiusX: 2, radiusY: 2, force: 0.5 }]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: at(0) })
  for (let i = 1; i <= 20; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: at(i) })
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await page.touchscreen.tap(2, 2)
}

/** Image XObjects on each page of a PDF: a drawn signature is one. */
async function imagesPerPage(bytes: Buffer): Promise<number[]> {
  const doc = await PDFDocument.load(bytes)
  return doc.getPages().map((p) => p.node.Resources()?.lookup(PDFName.of("XObject"), PDFDict)?.keys().length ?? 0)
}

test("Add signature to PDF on a phone: the pad opens on screen from page 2, a finger-drawn signature lands in the file", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await page.goto("/add-signature-to-pdf", { waitUntil: "networkidle" })
  await page.locator('input[type="file"]').first().setInputFiles({ name: "Lease.pdf", mimeType: "application/pdf", buffer: await samplePdf(3) })
  // Scrolled down to the page being signed, as one is when pressing the
  // sticky toolbar's Signature: the pad used to open far above the screen.
  await page.locator('[data-page="2"]').scrollIntoViewIfNeeded()
  await page.getByRole("toolbar").getByRole("button", { name: "Signature", exact: true }).click()
  const pad = page.getByRole("dialog", { name: "Create your signature" })
  const area = pad.getByLabel("Signature drawing area")
  await expect(area).toBeInViewport({ ratio: 1 })

  // Type, then back to Draw: what is used must be the drawing on screen.
  await pad.getByRole("tab", { name: "Type" }).click()
  await pad.getByRole("textbox").fill("Ama Mensah")
  await pad.getByRole("tab", { name: "Draw" }).click()
  await expect(pad.getByRole("button", { name: "Use this signature" })).toBeDisabled()
  await fingerDraw(page, area)
  await pad.getByRole("button", { name: "Use this signature" }).click()
  await expect(pad).toHaveCount(0)

  await tapPage(page, 2)
  await expect(page.locator('[data-page="2"] [aria-label="Signature"] img')).toBeVisible()
  const out = await downloaded(page, () => page.getByRole("button", { name: "Download signed PDF" }).click())
  expect(await imagesPerPage(out)).toEqual([0, 1, 0])
  await ctx.close()
})

test("Request a signature: the prepared request survives signup into Quick Send", async ({ browser }) => {
  const ctx = await browser.newContext(phone)
  const page = await ctx.newPage()
  await page.goto("/request-signature", { waitUntil: "networkidle" })
  await page.locator('input[type="file"]').first().setInputFiles({ name: "NDA.pdf", mimeType: "application/pdf", buffer: await samplePdf(1) })
  const signer = freshEmail("tool-signer")
  await page.getByLabel("Who needs to sign?").fill(signer)
  await expect(page.getByText(`Signature: ${signer}`)).toBeVisible()

  await page.getByRole("button", { name: "Create a free account to send" }).click()
  await page.waitForURL(/\/signup\?next=/)
  await page.getByPlaceholder("you@example.com").fill(freshEmail("tool-sender"))
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()

  await page.waitForURL("**/dashboard/documents/quick-send?draft=1", { timeout: 30_000 })
  await expect(page.locator("#emails")).toHaveValue(signer)
  await expect(page.getByText("NDA.pdf")).toBeVisible()
  await ctx.close()
})
