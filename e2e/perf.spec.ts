import { test, type Page, type CDPSession } from "@playwright/test"
import fs from "node:fs"
import { freshEmail, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"

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

type Profile = "mobile" | "desktop"
type Result = Record<string, number | string>
const results: Result[] = []
/** Writes what has been measured so far, so a run cut short still reports it. */
const save = () => fs.writeFileSync(report!, JSON.stringify(results, null, 2))

/**
 * Network and CPU conditions for `profile`. `cold` turns the browser cache
 * off, for first-visit page loads; the in-app interactions keep it on, as a
 * real visit does (the scripts it already loaded stay loaded).
 */
async function throttle(cdp: CDPSession, profile: Profile, cold = true) {
  await cdp.send("Network.enable")
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: cold })
  if (profile === "mobile") {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
    })
  }
}

/** Starts observers before the page's own scripts, so nothing is missed. */
const OBSERVE = () => {
  const w = window as unknown as { __perf: { lcp: number; cls: number; tbt: number; longTasks: number } }
  w.__perf = { lcp: 0, cls: 0, tbt: 0, longTasks: 0 }
  new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__perf.lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true })
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      const shift = e as PerformanceEntry & { value: number; hadRecentInput: boolean }
      if (!shift.hadRecentInput) w.__perf.cls += shift.value
    })
  ).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) =>
    l.getEntries().forEach((e) => {
      w.__perf.longTasks++
      w.__perf.tbt += Math.max(0, e.duration - 50)
    })
  ).observe({ type: "longtask", buffered: true })
}

/** Loads `path` cold and records its metrics. */
async function measureLoad(page: Page, cdp: CDPSession, label: string, path: string, profile: Profile) {
  let js = 0
  let total = 0
  let requests = 0
  const sizes = new Map<string, { type: string }>()
  const types = (e: { requestId: string; type?: string }) => sizes.set(e.requestId, { type: e.type ?? "" })
  const finished = (e: { requestId: string; encodedDataLength: number }) => {
    requests++
    total += e.encodedDataLength
    if (sizes.get(e.requestId)?.type === "Script") js += e.encodedDataLength
  }
  cdp.on("Network.responseReceived", types)
  cdp.on("Network.loadingFinished", finished)

  const started = Date.now()
  await page.goto(path, { waitUntil: "load", timeout: 120_000 })
  const loadMs = Date.now() - started
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {})
  await page.waitForTimeout(1500)
  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0
    const w = window as unknown as { __perf: { lcp: number; cls: number; tbt: number; longTasks: number } }
    return { ttfb: nav.responseStart, fcp, lcp: w.__perf.lcp, cls: w.__perf.cls, tbt: w.__perf.tbt, longTasks: w.__perf.longTasks, domContentLoaded: nav.domContentLoadedEventEnd }
  })
  cdp.off("Network.responseReceived", types)
  cdp.off("Network.loadingFinished", finished)

  results.push({
    profile,
    page: label,
    ttfbMs: Math.round(metrics.ttfb),
    fcpMs: Math.round(metrics.fcp),
    lcpMs: Math.round(metrics.lcp),
    cls: Number(metrics.cls.toFixed(3)),
    tbtMs: Math.round(metrics.tbt),
    loadMs,
    jsKB: Math.round(js / 1024),
    totalKB: Math.round(total / 1024),
    requests,
  })
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
