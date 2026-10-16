import { test, expect } from "@playwright/test"
import { freshEmail, password, samplePdf } from "./helpers/esign"

/**
 * Signup to first document sent, timed: the path a new visitor actually
 * takes, from the home page's main button to a sent document, by clicking
 * through the UI rather than jumping to URLs. The goal is under 60 seconds
 * for a person, with no card asked for at any point.
 *
 * A browser types instantly, so the figure printed here is the app's share
 * of the time (page loads, server actions, redirects). The test also counts
 * the screens and fields a person passes through, which is where human time
 * goes, and fails if the app's share alone eats a third of the budget.
 *
 * Runs with email confirmation off (the e2e server blanks RESEND_API_KEY),
 * as a deployment without Resend does. With Resend on, a password signup
 * also has to confirm its address before sending: see sending-limits.ts.
 */

test("a new visitor goes from the home page to a sent document quickly, without a card", async ({ page }) => {
  test.setTimeout(90_000)
  const marks: [string, number][] = []
  const start = Date.now()
  const mark = (step: string) => marks.push([step, Date.now() - start])
  const screens = new Set<string>()
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) screens.add(new URL(frame.url()).pathname)
  })

  await page.goto("/")
  mark("home page loaded")

  // Was a click on the hero's "Send your first document" button. The hero
  // now asks for the email in place (email-capture.tsx), and signup opens
  // with it filled in, so the visitor types it once.
  // await page.getByRole("main").getByRole("link", { name: /send your first document/i }).first().click()
  const email = freshEmail("first-doc")
  await page.getByRole("main").getByRole("textbox", { name: "Your email address" }).fill(email)
  await page.getByRole("main").getByRole("button", { name: "Get started" }).click()
  await page.getByPlaceholder("you@example.com").waitFor()
  mark("signup form shown")

  // await page.getByPlaceholder("you@example.com").fill(freshEmail("first-doc"))
  await expect(page.getByPlaceholder("you@example.com")).toHaveValue(email)
  await page.getByPlaceholder(/Password/).fill(password)
  await page.getByRole("button", { name: /create account|sign up/i }).click()
  // By path: the signup URL itself carries ?next=/dashboard/...
  await page.waitForURL((url) => url.pathname.startsWith("/dashboard"), { timeout: 30_000 })
  mark(`account created, on ${new URL(page.url()).pathname}`)

  // Wherever signup lands, the first document starts from Quick Send.
  if (!page.url().includes("/quick-send")) {
    await page.getByRole("link", { name: /quick send/i }).first().click()
    await page.waitForURL(/\/quick-send/)
    mark("Quick Send opened")
  }

  await page.locator('input[type="file"]').setInputFiles({ name: "Service agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() })
  await page.getByLabel("Who needs to sign?").fill("e2e-first-doc-signer@example.com")
  await page.getByRole("button", { name: /^Send to/ }).click()
  await page.waitForURL(/\/dashboard\/documents\/[^/?]+\?sent=1/, { timeout: 30_000 })
  mark("document sent")

  const total = Date.now() - start
  // Nothing on the way asked for a card.
  expect([...screens].some((p) => /billing|checkout/.test(p))).toBe(false)
  console.log(`\nSignup to first document (app time only):\n${marks.map(([s, ms]) => `  ${(ms / 1000).toFixed(1).padStart(5)}s  ${s}`).join("\n")}\n  screens: ${[...screens].join(" -> ")}\n`)
  expect(total).toBeLessThan(20_000)
})
