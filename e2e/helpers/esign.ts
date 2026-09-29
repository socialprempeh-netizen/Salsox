/**
 * Shared helpers for the e-signature end-to-end tests.
 *
 * Accounts use the e2e- prefix so `global-teardown.ts` removes them (and, by
 * cascade, their documents) after the run.
 */
import { expect, type Page } from "@playwright/test"
import { PDFDocument, StandardFonts } from "pdf-lib"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

export const password = "correct horse battery staple"
export const freshEmail = (tag = "sender") =>
  `e2e-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

let client: PrismaClient | null = null
/** Direct database access, to read tokens and to simulate time passing. */
export function db(): PrismaClient {
  client ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })
  return client
}

/** A small two-page agreement, generated per run so no fixture file is needed. */
export async function samplePdf(pages = 2): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842])
    page.drawText(`Service Agreement - page ${i}`, { x: 60, y: 760, size: 20, font })
    page.drawText("The parties agree to the terms set out in this document.", { x: 60, y: 720, size: 12, font })
  }
  return Buffer.from(await doc.save())
}

export async function signUp(page: Page, email = freshEmail()): Promise<string> {
  await page.goto("/signup")
  await page.getByPlaceholder("Name (optional)").fill("Ama Mensah")
  await page.getByPlaceholder("you@example.com").fill(email)
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()
  await page.waitForURL("**/dashboard", { timeout: 30_000 })
  return email
}

/** Quick Sends a generated PDF to `signers` and returns the new document id. */
export async function quickSend(page: Page, signers: string[], title = "Service agreement"): Promise<string> {
  await page.goto("/dashboard/documents/quick-send")
  await page.locator('input[type="file"]').setInputFiles({ name: `${title}.pdf`, mimeType: "application/pdf", buffer: await samplePdf() })
  await page.getByLabel("Who needs to sign?").fill(signers.join(", "))
  await page.getByRole("button", { name: /^Send to/ }).click()
  await page.waitForURL(/\/dashboard\/documents\/[^/?]+\?sent=1/, { timeout: 30_000 })
  const id = new URL(page.url()).pathname.split("/").pop()!
  expect(id).toBeTruthy()
  return id
}

export async function tokenFor(documentId: string, email: string): Promise<string> {
  const r = await db().recipient.findFirstOrThrow({ where: { documentId, email } })
  return r.token
}

/** Asserts the page has no horizontal scroll at the current viewport. */
export async function expectNoHorizontalScroll(page: Page, label: string) {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(scroll, `${label}: page is ${scroll}px wide in a ${client}px viewport`).toBeLessThanOrEqual(client + 1)
}
