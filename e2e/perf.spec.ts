import { test, type Page } from "@playwright/test"
import fs from "node:fs"
import { freshEmail, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"
// Throttling, observers and the load measurement moved to helpers/perf.ts,
// shared with perf-competitors.spec.ts so both measure the same way.
import { OBSERVE, measureLoad as measure, throttle, type Profile, type Result } from "./helpers/perf"

/**
 * Performance measurement: page loads and in-app navigation, as a phone and
 * as a desktop, against a production build (`next build && next start`).
 *
 * Why this exists: to set a baseline before optimising and to show the
 * before and after with the same yardstick. It records what Lighthouse
 * reports, measured in a real browser: time to first byte, first and
 * largest contentful paint, layout shift, total blocking time (long tasks
 * past 50ms), and how many bytes of JavaScript and in total each page
 * transfers.
 *
 * "Mobile" follows Lighthouse's mobile profile: a 412px phone, the CPU slowed
 * 4x, and a slow 4G network (150ms round trip, 1.6 Mbps down, 750 Kbps up).
 * "Desktop" is unthrottled at 1350px.
 *
 * Opt-in: it only runs with PERF_REPORT set to a file path, which receives
 * the results as JSON. Point it at a production server with E2E_BASE_URL
 * (the dev server's numbers say nothing about production).
 */

const report = process.env.PERF_REPORT
test.skip(!report, "set PERF_REPORT (and E2E_BASE_URL to a production build) to measure")
test.describe.configure({ mode: "serial" })

const results: Result[] = []
/** Writes what has been measured so far, so a run cut short still reports it. */
const save = () => fs.writeFileSync(report!, JSON.stringify(results, null, 2))

/** Loads `path` cold, records its metrics, and saves what has been measured. */
const measureLoad = async (page: Page, cdp: Parameters<typeof measure>[1], label: string, path: string, profile: Profile) => {
  await measure(page, cdp, label, path, profile, (r) => results.push(r))
  save()
}

/** Time from clicking a dashboard link to the new page's heading being visible. */
async function measureNav(page: Page, label: string, linkName: RegExp, heading: RegExp, profile: Profile) {
  // On a phone the links are entries of the navigation menu (a dropdown).
  const started = Date.now()
  if (profile === "mobile") await page.getByRole("menuitem", { name: linkName }).first().click()
  else await page.getByRole("link", { name: linkName }).first().click()
  await page.getByRole("heading", { name: heading }).first().waitFor({ timeout: 60_000 })
  results.push({ profile, page: label, navMs: Date.now() - started })
  save()
}

for (const profile of ["desktop", "mobile"] as const) {
  test(`performance: ${profile}`, async ({ browser }) => {
    test.setTimeout(1_800_000)
    const viewport = profile === "mobile" ? { width: 412, height: 823 } : { width: 1350, height: 940 }
    const ctx = await browser.newContext({ viewport, isMobile: profile === "mobile", hasTouch: profile === "mobile" })
    await ctx.addInitScript(OBSERVE)
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)

    // Public pages, cold.
    for (const [label, path] of [
      ["landing", "/"],
      ["pricing", "/pricing"],
      ["login", "/login"],
      ["tool: sign PDF", "/sign-pdf"],
      ["blog post", "/blog/how-to-sign-a-pdf"],
      ["compare: DocuSign", "/compare/docusign"],
    ] as const) {
      await throttle(cdp, "desktop")
      await page.goto("about:blank")
      await throttle(cdp, profile)
      await measureLoad(page, cdp, label, path, profile)
    }

    // Signed in (unthrottled setup, measured pages throttled).
    await throttle(cdp, "desktop")
    await signUp(page)
    const signer = freshEmail("perf")
    const documentId = await quickSend(page, [signer])
    const token = await tokenFor(documentId, signer)
    await page.goto("/dashboard/documents/new")
    await page.locator('input[type="file"]').setInputFiles({ name: "Lease.pdf", mimeType: "application/pdf", buffer: await samplePdf(2) })
    await page.getByRole("button", { name: "Continue to recipients" }).click()
    await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 60_000 })
    const draftEdit = new URL(page.url()).pathname

    for (const [label, path] of [
      ["dashboard", "/dashboard"],
      ["documents", "/dashboard/documents"],
      ["new document", "/dashboard/documents/new"],
      ["document detail", `/dashboard/documents/${documentId}`],
      ["editor (PDF)", draftEdit],
      ["billing", "/dashboard/billing"],
      ["signing page", `/sign/${token}`],
    ] as const) {
      await page.goto("about:blank")
      await throttle(cdp, profile)
      await measureLoad(page, cdp, label, path, profile)
      await throttle(cdp, "desktop")
    }

    // In-app navigation, warm (what moving around the dashboard feels like).
    await throttle(cdp, "desktop", false)
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle").catch(() => {})
    await throttle(cdp, profile, false)
    if (profile === "mobile") await page.getByRole("button", { name: /open navigation/i }).click()
    await measureNav(page, "nav: dashboard → documents", /^documents$/i, /^documents$/i, profile)
    if (profile === "mobile") await page.getByRole("button", { name: /open navigation/i }).click()
    await measureNav(page, "nav: documents → billing", /^billing$/i, /billing/i, profile)
    await throttle(cdp, "desktop", false)

    // Upload: from choosing a PDF to the editor being open. The page is open
    // for a few seconds first, as it is while someone picks a file.
    await page.goto("/dashboard/documents/new")
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.waitForTimeout(5000)
    await throttle(cdp, profile, false)
    const uploadStarted = Date.now()
    await page.locator('input[type="file"]').setInputFiles({ name: "Contract.pdf", mimeType: "application/pdf", buffer: await samplePdf(3) })
    await page.getByRole("button", { name: "Continue to recipients" }).click()
    await page.waitForURL(/\/dashboard\/documents\/[^/]+\/edit/, { timeout: 120_000 })
    await page.getByLabel("Name").waitFor({ timeout: 60_000 })
    results.push({ profile, page: "upload → editor ready", navMs: Date.now() - uploadStarted })
    save()
    await throttle(cdp, "desktop", false)

    // Signing: from the signer's landing page to the document's first page
    // drawn. The intro is on screen for a few seconds first, as it is while a
    // signer reads it. Its own throttled load, with a fresh cache: a signer
    // arrives from an email link, not from the dashboard.
    await cdp.send("Network.clearBrowserCache")
    await throttle(cdp, profile, false)
    await page.goto(`/sign/${token}`)
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.waitForTimeout(5000)
    const signStarted = Date.now()
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Review and sign" }).click()
    await page.locator("canvas").first().waitFor({ timeout: 120_000 })
    results.push({ profile, page: "signing: review → PDF drawn", navMs: Date.now() - signStarted })
    save()
    await throttle(cdp, "desktop")

    await ctx.close()
    save()
  })
}
