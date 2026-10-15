import { test, expect, type Page } from "@playwright/test"
import path from "node:path"
import { db, expectNoHorizontalScroll, freshEmail, giveBusinessPlan, signUp } from "./helpers/esign"

/**
 * The template library, end to end:
 *
 * 1. The public pages at both phone widths: the library with search and
 *    filters, a template page with its live preview, a category page, and an
 *    industry and a team page listing their templates. No sideways scroll.
 * 2. The real flow: browse the library, open a template, "Use this template",
 *    fill it in, open it in the editor with its fields already placed, add the
 *    signer's email and one more signature field, send, both parties sign,
 *    and the signed PDF downloads.
 * 3. Saving a customised template: refused on the free plan with an upgrade
 *    path, and saved and listed on a paid plan.
 *
 * Set SCREENSHOT_DIR to also save each view for review.
 */

test.describe.configure({ timeout: 240_000 })

const shotDir = process.env.SCREENSHOT_DIR
const shot = async (page: Page, name: string) => {
  if (shotDir) await page.screenshot({ path: path.join(shotDir, `${name}.png`), fullPage: true })
}

for (const width of [360, 390]) {
  test(`the template library and its pages fit a ${width}px phone`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()

    await page.goto("/templates")
    await expect(page.getByRole("heading", { level: 1, name: "Document templates, ready to sign" })).toBeVisible()
    const search = page.getByRole("searchbox", { name: "Search templates" })
    await search.fill("nda")
    await expect(page.getByText(/^3 templates$/)).toBeVisible()
    await expect(page).toHaveURL(/\?q=nda/)
    await search.fill("")
    await page.getByLabel("Category").selectOption("rentals")
    await expect(page.getByText(/^6 templates$/)).toBeVisible()
    await expectNoHorizontalScroll(page, `templates @${width}`)
    await shot(page, `${width}-templates-filtered`)

    await page.goto("/templates/residential-lease")
    await expect(page.getByRole("heading", { level: 1, name: "Residential lease agreement template" })).toBeVisible()
    // The live preview: sample details by default, the blank template on demand.
    await expect(page.getByText("Flat 3, 14 Mensah Wood Street, East Legon, Accra").first()).toBeVisible()
    await page.getByRole("tab", { name: "Blank template" }).click()
    await expect(page.getByText("[Property address]").first()).toBeVisible()
    await expectNoHorizontalScroll(page, `template page @${width}`)
    await shot(page, `${width}-template-page`)

    for (const [url, heading] of [
      ["/templates/category/proposals", "Proposal templates"],
      ["/esignature-for/clinics", /clinics/i],
      ["/esignature-for/sales-teams", /sales teams/i],
    ] as const) {
      await page.goto(url)
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible()
      await expectNoHorizontalScroll(page, `${url} @${width}`)
      await shot(page, `${width}-${url.split("/").pop()}`)
    }
    await expect(page.getByRole("heading", { name: "Templates to start from" })).toBeVisible()

    await ctx.close()
  })
}

test("browse → preview → use → editor → add signer and a field → send → both sign → download", async ({ browser }) => {
  const senderCtx = await browser.newContext()
  const sender = await senderCtx.newPage()
  const senderEmail = await signUp(sender)
  const signerEmail = freshEmail("nda-recipient")

  // Browse the library and open the template.
  await sender.goto("/templates")
  await sender.getByRole("searchbox", { name: "Search templates" }).fill("one-way")
  await sender.getByRole("link", { name: /One-way NDA template/ }).first().click()
  await sender.waitForURL("**/templates/one-way-nda")
  await expect(sender.getByRole("tab", { name: "With sample details" })).toBeVisible()

  // "Use this template" → signed in already, so straight to the use form.
  await sender.getByRole("link", { name: "Use this template" }).first().click()
  await sender.waitForURL("**/dashboard/templates/one-way-nda", { timeout: 30_000 })
  await sender.getByRole("button", { name: "Use sample details" }).click()
  await sender.getByLabel("Recipient legal name").fill("Northwind Builders Ltd")
  await sender.getByLabel("Document title").fill("NDA with Northwind")
  await shot(sender, "flow-01-use-form")
  await sender.getByRole("button", { name: "Create document and open the editor" }).click()
  await sender.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 60_000 })
  const documentId = sender.url().match(/documents\/([^/]+)\/edit/)![1]

  // The draft: the template's fields are already placed, one recipient per role.
  const draft = await db().document.findUniqueOrThrow({ where: { id: documentId }, include: { recipients: { orderBy: { order: "asc" } }, fields: true } })
  expect(draft.title).toBe("NDA with Northwind")
  expect(draft.recipients.map((r) => r.email)).toEqual([senderEmail, ""])
  expect(draft.fields.map((f) => f.type).sort()).toEqual(["DATE", "DATE", "NAME", "SIGNATURE", "SIGNATURE"])

  // Recipients: add the missing signer's email.
  const emails = sender.getByLabel("Email", { exact: true })
  await expect(emails.nth(1)).toHaveValue("")
  await emails.nth(1).fill(signerEmail)
  await shot(sender, "flow-02-editor-recipients")
  await sender.getByRole("button", { name: "Next", exact: true }).click()

  // Fields: they are already there; add one more signature for the recipient.
  await sender.getByRole("button", { name: "Recipient", exact: true }).first().click()
  await sender.getByRole("button", { name: "Signature", exact: true }).first().click()
  const firstPage = sender.locator("[data-page='1']")
  await expect(firstPage.locator("canvas")).toBeVisible({ timeout: 30_000 })
  const box = (await firstPage.boundingBox())!
  await firstPage.click({ position: { x: box.width * 0.55, y: box.height * 0.2 } })
  await shot(sender, "flow-03-editor-fields")
  await sender.getByRole("button", { name: "Next", exact: true }).click()

  // Send.
  await sender.getByRole("button", { name: "Send for signature" }).click()
  await sender.waitForURL(/\?sent=1/, { timeout: 30_000 })
  await expect(sender.getByText("Awaiting signatures")).toBeVisible()
  const sent = await db().document.findUniqueOrThrow({ where: { id: documentId }, include: { recipients: true, fields: { include: { recipient: true } } } })
  expect(sent.status).toBe("PENDING")
  expect(sent.fields.filter((f) => f.recipient.email === signerEmail).map((f) => f.type).sort()).toEqual(["DATE", "NAME", "SIGNATURE", "SIGNATURE"])

  // Both parties sign: each field in turn.
  for (const email of [signerEmail, senderEmail]) {
    const token = sent.recipients.find((r) => r.email === email)!.token
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await page.goto(`/sign/${token}`)
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Review and sign" }).click()
    const count = sent.fields.filter((f) => f.recipient.email === email).length
    await page.getByRole("button", { name: "Start" }).click()
    for (let i = 1; i <= count; i++) {
      const typeTab = page.getByRole("tab", { name: "Type" })
      const reuse = page.getByRole("button", { name: "Apply my signature" })
      const save = page.getByRole("button", { name: "Save", exact: true })
      // Wait for the field's sheet: a signature pad, or a prefilled input.
      await expect(typeTab.or(save)).toBeVisible()
      if (await reuse.isVisible()) {
        // A second signature reuses the one already adopted.
        await reuse.click()
      } else if (await typeTab.isVisible()) {
        await typeTab.click()
        await page.getByRole("button", { name: "Adopt and sign" }).click()
      } else {
        // Date and name fields arrive prefilled.
        await save.click()
      }
      await expect(page.getByText(`${i} of ${count} done`)).toBeVisible()
      if (i < count) await page.getByRole("button", { name: /Next field/ }).click()
    }
    await page.getByRole("button", { name: "Finish signing" }).click()
    await expect(page.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })
    await shot(page, `flow-04-signed-${email === senderEmail ? "sender" : "recipient"}`)
    await ctx.close()
  }

  // Completed, sealed, and the signed PDF downloads.
  const done = await db().document.findUniqueOrThrow({ where: { id: documentId } })
  expect(done.status).toBe("COMPLETED")
  expect(done.sealedKey).toBeTruthy()
  const token = sent.recipients.find((r) => r.email === signerEmail)!.token
  const download = await sender.request.get(`/sign/${token}/download`)
  expect(download.status()).toBe(200)
  expect(download.headers()["content-type"]).toContain("application/pdf")
  expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-")

  await senderCtx.close()
})

test("saving a customised template: locked on the free plan, saved on a paid one", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const email = await signUp(page)

  await page.goto("/dashboard/templates/freelance-contract")
  await page.getByRole("button", { name: "Save as your own template" }).click()
  await expect(page.getByText("Saving your own templates is part of the Personal plan.")).toBeVisible()
  await expectNoHorizontalScroll(page, "use template @390")
  await shot(page, "390-use-template-free")

  await giveBusinessPlan(email)
  await page.reload()
  await page.getByLabel("Client legal name").fill("Harvest Table Restaurants Ltd")
  await page.getByRole("button", { name: "Save as your own template" }).click()
  await page.getByRole("textbox", { name: "Template name" }).fill("Restaurant website contract")
  await page.getByRole("button", { name: "Save template" }).click()
  await page.waitForURL(/\?saved=/)
  await expect(page.getByText("Saved as “Restaurant website contract”")).toBeVisible()
  await expect(page.getByLabel("Client legal name")).toHaveValue("Harvest Table Restaurants Ltd")

  await page.goto("/dashboard/templates")
  await expect(page.getByRole("link", { name: /Restaurant website contract/ })).toBeVisible()
  await expectNoHorizontalScroll(page, "dashboard templates @390")
  await shot(page, "390-dashboard-templates")
  await ctx.close()
})
