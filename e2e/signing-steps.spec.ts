import { test, expect } from "@playwright/test"
import { db, expectNoHorizontalScroll, freshEmail, giveBusinessPlan, samplePdf, signUp } from "./helpers/esign"

/**
 * Signing steps (src/lib/esign/signing-steps.ts), as a sender meets them:
 *
 * - in a sequential document, a signer can share the step of the one above
 *   ("Sign at the same time as step 2"), the preview shows the steps, and an
 *   approver is labelled "Step 1" rather than "Signs 1st";
 * - the shared step is saved as a shared order and comes back checked when
 *   the draft is reopened;
 * - once the document is out, its page shows the order, who signs next and
 *   each recipient's step.
 *
 * At both phone widths the design rules require. The document is put out for
 * signing directly in the database, since placing fields is covered elsewhere
 * and this is about the order.
 */

test.describe.configure({ timeout: 180_000 })

for (const width of [360, 390]) {
  test(`recipients can share a step, and the document page shows who signs next @${width}`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    await giveBusinessPlan(await signUp(page))

    await page.goto("/dashboard/documents/new")
    await page.locator('input[type="file"]').setInputFiles({ name: "Supply agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf(1) })
    await page.getByRole("button", { name: "Continue to recipients" }).click()
    await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
    const documentId = page.url().match(/documents\/([^/]+)\/edit/)![1]

    const people = [
      ["Efua Mensah", freshEmail("efua"), "APPROVER"],
      ["Kofi Boateng", freshEmail("kofi"), "SIGNER"],
      ["Ama Mensah", freshEmail("ama"), "SIGNER"],
    ] as const
    for (let i = 0; i < people.length; i++) {
      if (i > 0) await page.getByRole("button", { name: "Add recipient" }).click()
      await page.getByLabel("Name").nth(i).fill(people[i][0])
      await page.getByLabel("Email").nth(i).fill(people[i][1])
      await page.getByLabel("Role").nth(i).selectOption(people[i][2])
    }
    // No step controls until signing order is on.
    await expect(page.getByText("Sign at the same time as")).toHaveCount(0)
    await page.getByLabel("Sign in order (one after another)").check()

    const preview = page.getByRole("list", { name: "Signing steps" })
    await expect(preview.getByRole("listitem")).toHaveCount(3)
    await page.getByLabel("Sign at the same time as step 2").check()
    await expect(preview.getByRole("listitem")).toHaveCount(2)
    await expect(preview.getByRole("listitem").nth(1)).toContainText("Kofi Boateng and Ama Mensah")
    // The approver's label is its step, not "Signs 1st".
    await expect(page.getByText("Signs 1st")).toHaveCount(0)
    await expect(page.getByText("Step 1", { exact: true }).first()).toBeVisible()
    await expectNoHorizontalScroll(page, `editor signing steps @${width}`)

    await page.getByRole("button", { name: "Next", exact: true }).click()
    await page.getByRole("button", { name: "Next", exact: true }).click()
    await page.getByRole("button", { name: "Save draft" }).click()
    await expect(page.getByText("Draft saved.")).toBeVisible()

    const saved = await db().recipient.findMany({ where: { documentId }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] })
    expect(saved.map((r) => [r.name, r.order])).toEqual([["Efua Mensah", 1], ["Kofi Boateng", 2], ["Ama Mensah", 2]])

    // Reopened, the shared step is still set.
    // A draft whose recipients are complete opens on Fields.
    await page.reload()
    await page.getByRole("button", { name: "Recipients" }).click()
    await expect(page.getByLabel("Sign at the same time as step 2")).toBeChecked()
    await expect(page.getByLabel("Sign at the same time as step 1")).not.toBeChecked()

    // Out for signing, with the approver done: Kofi and Ama are next.
    await db().document.update({ where: { id: documentId }, data: { status: "PENDING", sentAt: new Date() } })
    await db().recipient.updateMany({ where: { documentId, name: "Efua Mensah" }, data: { signingStatus: "SIGNED", signedAt: new Date() } })
    await page.goto(`/dashboard/documents/${documentId}`)
    await expect(page.getByText("Next to sign: Kofi Boateng and Ama Mensah.")).toBeVisible()
    const progress = page.getByRole("list", { name: "Signing steps" })
    await expect(progress.getByRole("listitem").first()).toContainText("Done")
    await expect(progress.getByRole("listitem").nth(1)).toContainText("Their turn")
    await expect(progress.getByRole("listitem").nth(1)).toHaveAttribute("aria-current", "step")
    await expect(page.getByText("Step 2", { exact: true })).toHaveCount(3)
    await expectNoHorizontalScroll(page, `document signing steps @${width}`)
    await ctx.close()
  })
}
