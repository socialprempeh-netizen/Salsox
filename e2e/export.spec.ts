import { test, expect } from "@playwright/test"
import JSZip from "jszip"
import { db, expectNoHorizontalScroll, freshEmail, quickSend, signUp } from "./helpers/esign"

/**
 * "Export everything", downloaded through the app and opened.
 *
 * The export used to build the whole archive in memory before sending it,
 * which failed on large accounts. It now streams, in parts of 100 documents.
 * This downloads a real export and reads it back, then gives the account a
 * hundred more documents (rows pointing at the same stored PDF, which is all
 * the export reads) so it splits in two, and checks the billing page offers
 * both parts and that the second holds exactly the documents past the first.
 */

test.describe.configure({ timeout: 180_000 })

test("the export streams a readable ZIP, and splits into parts on a large account", async ({ page }) => {
  const email = await signUp(page)
  const documentId = await quickSend(page, [freshEmail("export")], "Export sample")

  const single = await page.request.get("/api/export")
  expect(single.status()).toBe(200)
  const zip = await JSZip.loadAsync(await single.body(), { checkCRC32: true })
  const names = Object.keys(zip.files)
  expect(names).toContain("index.csv")
  expect(names.some((n) => n.endsWith("/original.pdf"))).toBe(true)
  const audit = JSON.parse(await zip.file(names.find((n) => n.endsWith("/audit.json"))!)!.async("string"))
  expect(audit.id).toBe(documentId)
  expect(audit.events.length).toBeGreaterThan(0)
  expect((await zip.file(names.find((n) => n.endsWith("/original.pdf"))!)!.async("string")).startsWith("%PDF")).toBe(true)

  // A hundred more documents: 101 in all, so two parts.
  const user = await db().user.findUniqueOrThrow({ where: { email } })
  const source = await db().document.findUniqueOrThrow({ where: { id: documentId } })
  await db().document.createMany({
    data: Array.from({ length: 100 }, (_, i) => ({
      userId: user.id,
      title: `Bulk ${String(i).padStart(3, "0")}`,
      status: "DRAFT" as const,
      originalKey: source.originalKey,
      originalSha256: source.originalSha256,
      pageCount: source.pageCount,
      createdAt: new Date(Date.now() + (i + 1) * 1000),
    })),
  })

  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto("/dashboard/billing")
  await expect(page.getByRole("link", { name: "Part 1 of 2" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Part 2 of 2" })).toBeVisible()
  await expectNoHorizontalScroll(page, "billing with export parts @360")

  const second = await page.request.get("/api/export?part=2")
  expect(second.status()).toBe(200)
  expect(second.headers()["content-disposition"]).toContain("part-2-of-2")
  const part2 = await JSZip.loadAsync(await second.body(), { checkCRC32: true })
  const folders = new Set(Object.keys(part2.files).filter((n) => n.includes("/")).map((n) => n.split("/")[0]))
  // Oldest first: the 101st document is the newest bulk one.
  expect([...folders]).toHaveLength(1)
  expect([...folders][0]).toContain("Bulk 099")

  expect((await page.request.get("/api/export?part=3")).status()).toBe(404)
})
