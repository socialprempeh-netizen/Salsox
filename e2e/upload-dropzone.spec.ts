import { test, expect, type Page } from "@playwright/test"
import { samplePdf, signUp } from "./helpers/esign"

/**
 * The PDF dropzone, driven the way a desktop user drives it: by dropping a
 * file. A dropped oversize PDF used to be copied into the form before it was
 * checked, so the "too large" message showed while the file stayed attached,
 * and submitting sent it past the server-action body limit, where Next throws
 * a raw error instead of returning the app's message.
 *
 * Covered on the new-document page and on Quick Send, which share the
 * component, at phone width as well as desktop.
 */

test.describe.configure({ timeout: 90_000 })

/** Drops a file named `name` with `bytes` onto the dropzone of the page. */
async function dropFile(page: Page, name: string, bytes: Buffer) {
  const dataTransfer = await page.evaluateHandle(
    ({ name, data }) => {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array(data)], name, { type: "application/pdf" }))
      return dt
    },
    { name, data: [...bytes] }
  )
  const zone = page.locator("label:has(input[type=file])")
  await zone.dispatchEvent("dragover", { dataTransfer })
  await zone.dispatchEvent("drop", { dataTransfer })
}

/** A PDF over the 4 MB cap: a real PDF followed by padding. */
async function oversizePdf(): Promise<Buffer> {
  return Buffer.concat([await samplePdf(1), Buffer.alloc(4 * 1024 * 1024 + 1024, 32)])
}

for (const path of ["/dashboard/documents/new", "/dashboard/documents/quick-send"]) {
  test(`a dropped oversize PDF is refused and never submitted (${path})`, async ({ page }) => {
    await signUp(page)
    await page.goto(path)
    const input = page.locator("input[type=file]")

    // A good file first, so the test also proves a rejection clears it.
    await dropFile(page, "fine.pdf", await samplePdf(1))
    await expect(page.getByText("fine.pdf")).toBeVisible()
    expect(await input.evaluate((el: HTMLInputElement) => el.files?.length)).toBe(1)

    await dropFile(page, "huge.pdf", await oversizePdf())
    await expect(page.getByRole("alert").filter({ hasText: "larger than 4 MB" })).toBeVisible()
    // Nothing attached, and the box no longer shows the earlier file.
    expect(await input.evaluate((el: HTMLInputElement) => el.files?.length ?? 0)).toBe(0)
    await expect(page.getByText("fine.pdf")).toHaveCount(0)

    // Submitting now is stopped by the browser for the missing file: no
    // request carries the oversize PDF, so no raw error can come back.
    // Quick Send keeps its button disabled until there is a recipient, so
    // one is entered: the only thing missing is then the file.
    if (path.endsWith("quick-send")) await page.locator("#emails").fill("someone@example.com")
    const posts: string[] = []
    page.on("request", (r) => r.method() === "POST" && posts.push(r.url()))
    await page.locator("form button[type=submit]").first().click()
    await page.waitForTimeout(500)
    expect(posts).toEqual([])
    expect(await input.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true)
  })
}

test("the dropzone fits a 360px phone and still refuses an oversize file", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await signUp(page)
  await page.goto("/dashboard/documents/new")
  await dropFile(page, "huge.pdf", await oversizePdf())
  await expect(page.getByRole("alert").filter({ hasText: "larger than 4 MB" })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await ctx.close()
})
