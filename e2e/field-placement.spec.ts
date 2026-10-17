import { test, expect, type Page } from "@playwright/test"
import { db, expectNoHorizontalScroll, freshEmail, samplePdf, signUp } from "./helpers/esign"

/**
 * Placing fields in the editor, and keeping them (document-editor.tsx).
 *
 * Added after a report that choosing "Signature" and clicking the page placed
 * nothing, so sending stopped at "… has no fields yet". The editor test in
 * esign.spec.ts places one field on a phone and sends straight away; this one
 * covers what it did not:
 *
 * - a mouse click at laptop size and a tap at both phone widths;
 * - a field on the second page as well as the first;
 * - the fields surviving "Save draft" and a reload, landing where they were
 *   placed, and the document then sending without the "no fields" error.
 */

test.describe.configure({ timeout: 180_000 })

const sizes = [
  { name: "laptop", viewport: { width: 1366, height: 768 }, isMobile: false, hasTouch: false },
  { name: "phone 360", viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
  { name: "phone 390", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
]

/** Arms a field type and clicks (or taps) a page at fractions of its size. */
async function place(page: Page, type: string, pageNumber: number, fx: number, fy: number) {
  await page.getByRole("button", { name: type, exact: true }).click()
  await expect(page.getByText("Now tap the page where the field should go.")).toBeVisible()
  const pageEl = page.locator(`[data-page='${pageNumber}']`)
  await pageEl.scrollIntoViewIfNeeded()
  await expect(pageEl.locator("canvas")).toBeVisible({ timeout: 30_000 })
  const box = (await pageEl.boundingBox())!
  await pageEl.click({ position: { x: box.width * fx, y: box.height * fy } })
  // Placed: the field is on the page and the prompt is gone.
  await expect(pageEl.getByRole("button", { name: type })).toHaveCount(1)
  await expect(page.getByText("Now tap the page where the field should go.")).toHaveCount(0)
}

for (const size of sizes) {
  test(`a placed field is kept through save and reload, then sends (${size.name})`, async ({ browser }) => {
    const ctx = await browser.newContext(size)
    const page = await ctx.newPage()
    await signUp(page)

    await page.goto("/dashboard/documents/new")
    await page.locator('input[type="file"]').setInputFiles({ name: "Contract.pdf", mimeType: "application/pdf", buffer: await samplePdf(2) })
    await page.getByRole("button", { name: "Continue to recipients" }).click()
    await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
    const documentId = page.url().split("/").at(-2)!
    await page.getByLabel("Name").fill("Kofi Boateng")
    await page.getByLabel("Email").fill(freshEmail("fields"))
    await page.getByRole("button", { name: "Next", exact: true }).click()

    // Choosing the recipient first, as a sender with several would.
    await page.getByRole("button", { name: "Kofi Boateng" }).click()
    await place(page, "Signature", 1, 0.5, 0.6)
    await place(page, "Date", 2, 0.3, 0.2)
    await expectNoHorizontalScroll(page, `editor fields (${size.name})`)

    await page.getByRole("button", { name: "Next", exact: true }).click()
    await expect(page.getByText("1 recipient, 2 fields.")).toBeVisible()
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(page.getByText("Draft saved.")).toBeVisible()

    const saved = await db().field.findMany({ where: { documentId }, orderBy: { page: "asc" } })
    expect(saved.map((f) => [f.type, f.page])).toEqual([["SIGNATURE", 1], ["DATE", 2]])
    // Centred where it was clicked: 50% across, 60% down.
    expect(saved[0].x + saved[0].width / 2).toBeCloseTo(50, 0)
    expect(saved[0].y + saved[0].height / 2).toBeCloseTo(60, 0)

    // Reopened, the draft starts on Fields with both fields drawn.
    await page.reload()
    await expect(page.locator("[data-page='1']").getByRole("button", { name: "Signature" })).toBeVisible({ timeout: 30_000 })
    await page.locator("[data-page='2']").scrollIntoViewIfNeeded()
    await expect(page.locator("[data-page='2']").getByRole("button", { name: "Date" })).toBeVisible()

    await page.getByRole("button", { name: "Next", exact: true }).click()
    await page.getByRole("button", { name: "Send for signature" }).click()
    await expect(page.getByText(/has no fields yet/)).toHaveCount(0)
    await page.waitForURL(/\/dashboard\/documents\/[^/]+(\?sent=1)?$/, { timeout: 30_000 })
    expect((await db().document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe("PENDING")
    expect(await db().field.count({ where: { documentId } })).toBe(2)
    await ctx.close()
  })
}

/**
 * The live diagnostics (components/esign/placement-diagnostics.tsx), with
 * ?placementDebug=1: a click that places a field is recorded as placed, and a
 * click on a page that something else covers is recorded as "covered", naming
 * the element on top. That is the record a sender can screenshot, and what
 * goes to Sentry, when placement fails in the field.
 */
test("placement diagnostics name what happened to each click", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await signUp(page)
  await page.goto("/dashboard/documents/new")
  await page.locator('input[type="file"]').setInputFiles({ name: "Contract.pdf", mimeType: "application/pdf", buffer: await samplePdf(1) })
  await page.getByRole("button", { name: "Continue to recipients" }).click()
  await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
  await page.goto(page.url() + "?placementDebug=1")
  await page.getByLabel("Name").fill("Kofi Boateng")
  await page.getByLabel("Email").fill(freshEmail("diag"))
  await page.getByRole("button", { name: "Next", exact: true }).click()

  const panel = page.getByTestId("placement-debug")
  await place(page, "Signature", 1, 0.5, 0.7)
  await expect(panel.getByRole("listitem").first()).toContainText("placed SIGNATURE")

  // Something laid over the page takes the next click.
  await page.getByRole("button", { name: "Text", exact: true }).click()
  const pageEl = page.locator("[data-page='1']")
  const box = (await pageEl.boundingBox())!
  await page.evaluate(({ x, y }) => {
    const cover = document.createElement("div")
    cover.id = "cover"
    Object.assign(cover.style, { position: "fixed", left: `${x - 40}px`, top: `${y - 40}px`, width: "80px", height: "80px", zIndex: "50" })
    document.body.appendChild(cover)
  }, { x: box.x + box.width / 2, y: box.y + box.height * 0.3 })
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3)
  await expect(panel.getByRole("listitem").first()).toContainText("covered TEXT")
  await expect(panel.getByRole("listitem").first()).toContainText("div#cover")
  await expect(page.getByText("Now tap the page where the field should go.")).toBeVisible()
  await expectNoHorizontalScroll(page, "editor with placement diagnostics")
  await ctx.close()
})
