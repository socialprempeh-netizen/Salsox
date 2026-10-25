import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { db, freshEmail, samplePdf, signUp } from "./helpers/esign"

/**
 * The Salsox Signing Chrome extension (extensions/salsox-signing), loaded
 * unpacked in Chromium against this app, from connecting to sending:
 *
 * 1. Connect while signed out: the extension is told so and opens the
 *    sign-in page in a tab. Signed in, Connect opens /extension/connect in
 *    Chrome's sign-in window; confirming there gives the extension its key.
 * 2. A PDF chosen in the popup, a signature for signer 1, a date and a text
 *    field for signer 2 (on page 2), one field dragged.
 * 3. On the Free plan, "sign in order" and Sign & Pay each offer an upgrade
 *    instead; a missing email is caught before sending.
 * 4. Sent: the document exists with both recipients and the fields where
 *    they were put, through POST /api/v1/documents.
 * 5. With the month's free documents used, the popup offers the upgrade,
 *    which opens /pricing. Disconnect revokes the key on the server.
 *
 * The copy under test points config.js and host_permissions at this app
 * instead of salsox.com; nothing else is changed. The popup is opened as a
 * tab, since a script cannot click the toolbar button. SHOT_DIR, when set,
 * receives a screenshot of each step for review.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100"
const SOURCE = path.join(process.cwd(), "extensions", "salsox-signing")
const shots = process.env.SHOT_DIR

test.describe.configure({ timeout: 240_000 })

function copyForTest(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "salsox-signing-"))
  fs.cpSync(SOURCE, dir, { recursive: true })
  const config = path.join(dir, "config.js")
  fs.writeFileSync(config, fs.readFileSync(config, "utf8").replace('"https://salsox.com"', JSON.stringify(BASE)))
  const manifestPath = path.join(dir, "manifest.json")
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
  manifest.host_permissions = [`${new URL(BASE).origin}/*`]
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  return dir
}

const shot = async (page: Page, name: string) => {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) })
}

/**
 * Clicks the page layer at a fraction of its size. Through the locator, so
 * the viewer scrolls there first (a page is taller than the popup), as a
 * person would scroll.
 */
async function clickPage(popup: Page, fx: number, fy: number) {
  const layer = popup.locator("#layer")
  const box = (await layer.boundingBox())!
  await layer.click({ position: { x: box.width * fx, y: box.height * fy } })
}

test("Salsox Signing: connect, place fields, upgrade prompts, send, limit, disconnect", async () => {
  const dir = copyForTest()
  const context: BrowserContext = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    baseURL: BASE,
    viewport: { width: 800, height: 600 },
    args: [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`],
  })
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"))
    const extensionId = new URL(worker.url()).host
    const popup = await context.newPage()
    const errors: string[] = []
    popup.on("pageerror", (e) => errors.push(e.message))
    await popup.goto(`chrome-extension://${extensionId}/popup.html`)
    await expect(popup.locator("#connect")).toBeVisible()
    await shot(popup, "1-connect")

    // 1. Signed out: told so, and the sign-in page opens in a tab.
    const loginTab = context.waitForEvent("page", (p) => p.url().includes("/login"))
    await popup.locator("#connect-btn").click()
    await (await loginTab).close()
    await expect(popup.locator("#notice")).toContainText("Sign in to Salsox")

    // Signed in (the extension's window shares this session), then connect.
    const site = await context.newPage()
    const email = await signUp(site, freshEmail("ext"))
    await site.close()
    const authWindow = context.waitForEvent("page", (p) => p.url().includes("/extension/connect"))
    await popup.locator("#connect-btn").click()
    const consent = await authWindow
    await expect(consent.getByRole("heading", { name: "Connect the Chrome extension" })).toBeVisible()
    await expect(consent.getByText(email)).toBeVisible()
    await shot(consent, "2-consent")
    await consent.getByRole("button", { name: "Connect", exact: true }).click()
    await expect(popup.locator("#upload")).toBeVisible({ timeout: 20_000 })
    await expect(popup.locator("#who")).toHaveText(email)
    await expect(popup.locator("#allowance")).toHaveText("Free plan: 3 of 3 free documents left this month")
    const user = await db().user.findUniqueOrThrow({ where: { email } })
    expect(await db().apiKey.count({ where: { userId: user.id, revokedAt: null } })).toBe(1)
    await shot(popup, "3-upload")

    // 2. A PDF, and fields for two signers.
    await popup.locator("#file").setInputFiles({ name: "Service agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf(2) })
    await expect(popup.locator("#place")).toBeVisible()
    await expect(popup.locator("#page-label")).toHaveText("Page 1 of 2")
    await expect(popup.locator("#to-recipients")).toBeDisabled()
    await clickPage(popup, 0.3, 0.85)
    await expect(popup.locator(".field")).toHaveCount(1)
    // Drag it: the stored position follows.
    const field = popup.locator(".field").first()
    const fb = (await field.boundingBox())!
    await popup.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await popup.mouse.down()
    await popup.mouse.move(fb.x + fb.width / 2 + 120, fb.y + fb.height / 2 - 60, { steps: 6 })
    await popup.mouse.up()
    await popup.getByRole("button", { name: "+ Add signer" }).click()
    await expect(popup.locator("#place-hint")).toHaveText("Place at least one field for Signer 2.")
    await popup.locator("#next").click()
    await expect(popup.locator("#page-label")).toHaveText("Page 2 of 2")
    await popup.locator('.tool[data-type="DATE"]').click()
    await clickPage(popup, 0.6, 0.7)
    await popup.locator('.tool[data-type="TEXT"]').click()
    await clickPage(popup, 0.4, 0.5)
    await popup.locator("#sel-label").fill("Job title")
    await expect(popup.locator(".field.selected")).toContainText("Job title")
    await shot(popup, "4-place")
    await popup.locator("#to-recipients").click()

    // 3. Recipients, and the upgrade prompts on the Free plan.
    await expect(popup.locator("#recipients")).toBeVisible()
    await expect(popup.locator("#title")).toHaveValue("Service agreement")
    // The popup unticks it at once and offers the upgrade instead.
    await popup.locator("#in-order").click()
    await expect(popup.locator("#upgrade")).toContainText("Signing in order is a Business feature")
    await expect(popup.locator("#in-order")).not.toBeChecked()
    await popup.locator("#pay").click()
    await expect(popup.locator("#upgrade")).toContainText("Sign & Pay is a Business feature")
    await shot(popup, "5-upgrade")
    await popup.locator("#upgrade").getByRole("button", { name: "Not now" }).click()
    const emails = popup.locator('#people input[type="email"]')
    await emails.nth(0).fill("ama@example.com")
    await popup.locator("#send").click()
    await expect(popup.locator(".person .err")).toHaveText("Enter a valid email address.")
    await emails.nth(1).fill("kofi@example.com")
    await popup.locator('#people input[aria-label="Signer 2 name"]').fill("Kofi Boateng")
    await popup.locator("#message").fill("Please sign by Friday.")
    await shot(popup, "6-recipients")

    // 4. Sent, as the API received it.
    await popup.locator("#send").click()
    await expect(popup.locator("#sent")).toBeVisible({ timeout: 30_000 })
    await expect(popup.locator("#sent-body")).toContainText("ama@example.com, kofi@example.com")
    await shot(popup, "7-sent")
    const doc = await db().document.findFirstOrThrow({ where: { userId: user.id }, include: { recipients: { orderBy: { order: "asc" } }, fields: true } })
    expect(doc.status).toBe("PENDING")
    expect(doc.title).toBe("Service agreement")
    expect(doc.message).toBe("Please sign by Friday.")
    expect(doc.recipients.map((r) => [r.email, r.name])).toEqual([["ama@example.com", "Ama"], ["kofi@example.com", "Kofi Boateng"]])
    const byType = Object.fromEntries(doc.fields.map((f) => [f.type, f]))
    expect(byType.SIGNATURE.page).toBe(1)
    expect(byType.SIGNATURE.x).toBeGreaterThan(20) // dragged right from where it was placed (15)
    expect(byType.DATE.page).toBe(2)
    expect(byType.TEXT.label).toBe("Job title")
    expect(byType.DATE.recipientId).toBe(doc.recipients[1].id)
    expect(byType.SIGNATURE.recipientId).toBe(doc.recipients[0].id)

    // 5. The month's free documents used: the upgrade, and where it leads.
    await db().document.createMany({
      data: [1, 2].map((n) => ({ userId: user.id, title: `Earlier ${n}`, originalKey: `e2e/${user.id}/${n}`, originalSha256: "0".repeat(64), pageCount: 1, status: "PENDING" as const, sentAt: new Date() })),
    })
    await popup.locator("#another").click()
    await popup.reload()
    await expect(popup.locator("#allowance")).toHaveText("Free plan: 0 of 3 free documents left this month")
    await expect(popup.locator("#upload-upgrade")).toContainText("You've used this month's free documents")
    await expect(popup.locator("#file")).toBeDisabled()
    await shot(popup, "8-limit")
    const pricing = context.waitForEvent("page", (p) => p.url().includes("/pricing"))
    await popup.locator("#upload-upgrade").getByRole("button", { name: "See plans" }).click()
    expect((await pricing).url()).toContain("utm_source=salsox_signing")

    // Disconnect: the key is revoked on the server, and the popup forgets it.
    await popup.locator("#disconnect").click()
    await expect(popup.locator("#connect")).toBeVisible()
    expect(await db().apiKey.count({ where: { userId: user.id, revokedAt: null } })).toBe(0)
    expect(errors, errors.join(" | ")).toEqual([])
  } finally {
    await context.close()
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
