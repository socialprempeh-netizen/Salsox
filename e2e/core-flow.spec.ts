import { test, expect, type Page } from "@playwright/test"
import { inflateSync } from "node:zlib"
import { PDFDocument } from "pdf-lib"
import { db, freshEmail, samplePdf, signUp, tokenFor, giveBusinessPlan } from "./helpers/esign"

/**
 * The core signing engine, driven the way a person uses it, start to finish.
 *
 * Unlike the narrower tests in esign.spec.ts, this one walks the whole
 * journey through the full editor in one go: a signed-in sender uploads a
 * PDF, adds two recipients, places signature, date and text fields for them,
 * and sends. Each recipient then opens their own link (one on a desktop, one
 * on a phone) and signs. Along the way it checks what the database recorded,
 * that the link the sender is offered to share is the one that works, that
 * the audit trail holds every step, and that the sealed PDF carries the
 * values that were entered plus the certificate page.
 *
 * Screenshots of each stage are attached to the test results, so a run is
 * evidence a person can look at, not only a pass mark. No email is sent: the
 * e2e server runs without a Resend key (see playwright.config.ts).
 */

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }

test.describe.configure({ timeout: 180_000 })

/** Every text the PDF draws, from its (Flate-compressed) content streams. */
function pdfText(bytes: Buffer): string {
  const raw = bytes.toString("latin1")
  let out = ""
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    try {
      out += inflateSync(Buffer.from(match[1], "latin1")).toString("latin1") + "\n"
    } catch {
      // Not a Flate stream (an image, a font): nothing to read here.
    }
  }
  // pdf-lib writes standard-font text as hex strings: <48656C6C6F> Tj
  return out.replace(/<([0-9A-Fa-f]+)>/g, (_, hex: string) => Buffer.from(hex, "hex").toString("latin1"))
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true })
}

/** Arms a field tool and taps the page at a fraction of its size. */
async function place(page: Page, tool: string, pageNumber: number, fx: number, fy: number) {
  await page.getByRole("button", { name: tool, exact: true }).first().click()
  const pageEl = page.locator(`[data-page='${pageNumber}']`)
  await expect(pageEl.locator("canvas")).toBeVisible({ timeout: 30_000 })
  const box = (await pageEl.boundingBox())!
  await pageEl.click({ position: { x: box.width * fx, y: box.height * fy } })
}

test("upload → fields for two recipients → send → both sign via their links → audit and sealed PDF", async ({ browser }) => {
  // ── Sender: sign up, upload ───────────────────────────────────────────────
  const senderCtx = await browser.newContext()
  const sender = await senderCtx.newPage()
  const senderEmail = await signUp(sender)
  // The certificate page asserted below is a Business feature.
  await giveBusinessPlan(senderEmail)
  const ama = freshEmail("ama")
  const kwame = freshEmail("kwame")

  await sender.goto("/dashboard/documents/new")
  await sender.locator('input[type="file"]').setInputFiles({ name: "Consulting agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf(2) })
  await shot(sender, "01-upload")
  await sender.getByRole("button", { name: "Continue to recipients" }).click()
  await sender.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 30_000 })
  const documentId = sender.url().split("/").at(-2)!

  // ── Two recipients ────────────────────────────────────────────────────────
  await sender.getByLabel("Name", { exact: true }).nth(0).fill("Ama Owusu")
  await sender.getByLabel("Email", { exact: true }).nth(0).fill(ama)
  await sender.getByRole("button", { name: "Add recipient" }).click()
  await sender.getByLabel("Name", { exact: true }).nth(1).fill("Kwame Asante")
  await sender.getByLabel("Email", { exact: true }).nth(1).fill(kwame)
  await shot(sender, "02-recipients")
  await sender.getByRole("button", { name: "Next", exact: true }).click()

  // ── Fields: signature, date and text for Ama; signature and date for Kwame
  await place(sender, "Signature", 1, 0.5, 0.3)
  await place(sender, "Date", 1, 0.5, 0.45)
  await place(sender, "Text", 1, 0.5, 0.6)
  await sender.getByRole("button", { name: "Kwame Asante" }).click()
  await place(sender, "Signature", 2, 0.5, 0.3)
  await place(sender, "Date", 2, 0.5, 0.45)
  await shot(sender, "03-fields")
  await sender.getByRole("button", { name: "Next", exact: true }).click()
  await shot(sender, "04-review")

  // ── Send ──────────────────────────────────────────────────────────────────
  await sender.getByRole("button", { name: "Send for signature" }).click()
  await sender.waitForURL(/\?sent=1/, { timeout: 30_000 })
  await expect(sender.getByText("Awaiting signatures")).toBeVisible()
  // No Resend key on this server, so nobody was emailed: the page must say
  // so, and must not claim "Each recipient got an email".
  await expect(sender.getByText("Email isn't configured: share the signing links manually")).toBeVisible()
  await expect(sender.getByText(/Each recipient got an email/)).toHaveCount(0)
  await expect(sender.getByText("Share link manually")).toHaveCount(2)
  await shot(sender, "05-sent")

  const recipients = await db().recipient.findMany({ where: { documentId }, orderBy: { email: "asc" } })
  expect(recipients.map((r) => r.email).sort()).toEqual([ama, kwame].sort())
  const fields = await db().field.findMany({ where: { documentId }, include: { recipient: true } })
  const byEmail = (email: string) => fields.filter((f) => f.recipient.email === email).map((f) => f.type).sort()
  expect(byEmail(ama)).toEqual(["DATE", "SIGNATURE", "TEXT"])
  expect(byEmail(kwame)).toEqual(["DATE", "SIGNATURE"])
  expect((await db().document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe("PENDING")

  // The link the sender is offered to share (WhatsApp item of the Share menu)
  // is the recipient's real signing link.
  const amaToken = await tokenFor(documentId, ama)
  const kwameToken = await tokenFor(documentId, kwame)
  await sender.getByRole("button", { name: "Share" }).first().click()
  const whatsapp = await sender.getByRole("menuitem", { name: /WhatsApp/ }).getAttribute("href")
  await sender.keyboard.press("Escape")
  const shared = decodeURIComponent(whatsapp ?? "").match(/\/sign\/([A-Za-z0-9_-]+)/)?.[1]
  expect([amaToken, kwameToken]).toContain(shared)

  // ── Ama signs on a desktop ────────────────────────────────────────────────
  const amaCtx = await browser.newContext()
  const amaPage = await amaCtx.newPage()
  await amaPage.goto(`/sign/${amaToken}`)
  await expect(amaPage.getByRole("heading", { name: "Consulting agreement" })).toBeVisible()
  await shot(amaPage, "06-ama-opens-link")
  await amaPage.getByRole("checkbox").check()
  await amaPage.getByRole("button", { name: "Review and sign" }).click()
  await amaPage.getByRole("button", { name: "Start" }).click()
  await amaPage.getByRole("tab", { name: "Type" }).click()
  await amaPage.getByRole("button", { name: "Adopt and sign" }).click()
  await expect(amaPage.getByText("1 of 3 done")).toBeVisible()
  await amaPage.getByRole("button", { name: /Next field/ }).click()
  await amaPage.getByRole("button", { name: "Save" }).click()
  await expect(amaPage.getByText("2 of 3 done")).toBeVisible()
  await amaPage.getByRole("button", { name: /Next field/ }).click()
  await amaPage.getByRole("textbox").last().fill("Net 30 payment terms")
  await amaPage.getByRole("button", { name: "Save" }).click()
  await expect(amaPage.getByText("3 of 3 done")).toBeVisible()
  await shot(amaPage, "07-ama-fields-done")
  await amaPage.getByRole("button", { name: "Finish signing" }).click()
  await expect(amaPage.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })
  await shot(amaPage, "08-ama-signed")
  expect((await db().document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe("PENDING")

  // ── Kwame signs on a phone ────────────────────────────────────────────────
  const kwameCtx = await browser.newContext(phone)
  const kwamePage = await kwameCtx.newPage()
  await kwamePage.goto(`/sign/${kwameToken}`)
  await kwamePage.getByRole("checkbox").check()
  await kwamePage.getByRole("button", { name: "Review and sign" }).click()
  await kwamePage.getByRole("button", { name: "Start" }).click()
  await kwamePage.getByRole("tab", { name: "Type" }).click()
  await kwamePage.getByRole("button", { name: "Adopt and sign" }).click()
  await expect(kwamePage.getByText("1 of 2 done")).toBeVisible()
  await kwamePage.getByRole("button", { name: /Next field/ }).click()
  await kwamePage.getByRole("button", { name: "Save" }).click()
  await expect(kwamePage.getByText("2 of 2 done")).toBeVisible()
  await kwamePage.getByRole("button", { name: "Finish signing" }).click()
  await expect(kwamePage.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })
  await shot(kwamePage, "09-kwame-signed-phone")

  // ── What was recorded ─────────────────────────────────────────────────────
  const document = await db().document.findUniqueOrThrow({ where: { id: documentId } })
  expect(document.status).toBe("COMPLETED")
  expect(document.sealedKey).toBeTruthy()
  const filled = await db().field.findMany({ where: { documentId }, include: { signature: true, recipient: true } })
  for (const f of filled) expect(f.inserted, `${f.type} for ${f.recipient.email}`).toBe(true)
  expect(filled.find((f) => f.type === "TEXT")?.value).toBe("Net 30 payment terms")
  for (const f of filled.filter((f) => f.type === "DATE")) expect(f.value).toBeTruthy()
  for (const f of filled.filter((f) => f.type === "SIGNATURE")) expect(f.signature?.typedText).toBeTruthy()

  const audit = await db().auditEvent.findMany({ where: { documentId }, orderBy: { createdAt: "asc" } })
  console.log("AUDIT TRAIL\n" + audit.map((e) => `  ${e.createdAt.toISOString()}  ${e.type.padEnd(20)} ${e.actorEmail ?? ""}`).join("\n"))
  const count = (type: string) => audit.filter((e) => e.type === type).length
  expect(count("DOCUMENT_CREATED")).toBe(1)
  expect(count("DOCUMENT_SENT")).toBe(1)
  expect(count("DOCUMENT_VIEWED")).toBe(2)
  expect(count("FIELD_SIGNED")).toBe(5)
  expect(count("RECIPIENT_SIGNED")).toBe(2)
  expect(count("DOCUMENT_COMPLETED")).toBe(1)
  expect(audit.find((e) => e.type === "DOCUMENT_SENT")?.actorEmail).toBe(senderEmail)
  expect(new Set(audit.filter((e) => e.type === "RECIPIENT_SIGNED").map((e) => e.actorEmail))).toEqual(new Set([ama, kwame]))

  // No Resend key on this server: nothing was emailed, so nobody is recorded
  // as emailed. This used to read `sentAt` set for both, on no email at all.
  for (const r of recipients) expect(r.sentAt, `${r.email} sentAt`).toBeNull()

  // ── The sealed PDF ────────────────────────────────────────────────────────
  const res = await kwamePage.request.get(`/sign/${kwameToken}/download`)
  expect(res.status()).toBe(200)
  const sealedBytes = Buffer.from(await res.body())
  expect((await PDFDocument.load(sealedBytes)).getPageCount()).toBe(3) // 2 pages + certificate
  const text = pdfText(sealedBytes)
  expect(text).toContain("Net 30 payment terms")
  expect(text).toContain(ama)
  expect(text).toContain(kwame)

  // ── The sender's view: completed, with the audit trail ────────────────────
  await sender.goto(`/dashboard/documents/${documentId}`)
  await expect(sender.getByText("Completed", { exact: true })).toBeVisible()
  await expect(sender.getByText("Completed by all parties")).toBeVisible()
  await shot(sender, "10-sender-completed-audit")

  await senderCtx.close()
  await amaCtx.close()
  await kwameCtx.close()
})
