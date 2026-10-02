import { test, expect, type Page } from "@playwright/test"
import { freshEmail as esignEmail, quickSend, tokenFor } from "./helpers/esign"
import AxeBuilder from "@axe-core/playwright"

/**
 * WCAG 2.1 AA, on every surface rather than on the marketing pages alone.
 *
 * What this can and cannot do is worth stating, because an automated
 * accessibility test that is trusted too far is worse than none: axe finds
 * roughly a third of the barriers in WCAG, the mechanical third — contrast
 * ratios, missing names, broken landmarks, heading order. It cannot tell you
 * whether a flow can be completed with a keyboard, whether focus goes somewhere
 * sensible after an action, or whether a label says something useful. Those
 * stay on the manual checklist, and this file does not pretend otherwise.
 *
 * The gate is serious and critical. Minor and moderate findings are printed for
 * whoever is reading the run, but they do not fail the build: a kit that cannot
 * be released because of a 4.4:1 contrast on a disabled placeholder teaches
 * people to skip the test, and then it protects nothing.
 */

const PUBLIC_PAGES = [
  { path: "/", name: "home" },
  { path: "/pricing", name: "pricing" },
  { path: "/blog", name: "blog" },
  { path: "/docs", name: "docs" },
  { path: "/login", name: "sign in" },
  // An error message is red text on a red tint, which no page shows until
  // something goes wrong, so one is asked for on purpose.
  { path: "/login?error=credentials", name: "sign in with an error" },
  { path: "/signup", name: "sign up" },
  { path: "/contact", name: "contact" },
]

const password = "correct horse battery staple"
const freshEmail = () => `e2e-a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`

async function scan(page: Page, label: string) {
  // Measured with reduced motion, which is not a way of quieting the audit but
  // the only way to measure the right thing. The price block fades in from
  // opacity 0, and axe caught it mid-animation: it reported 2.5:1 on text that
  // settles at 4.76:1. Asking for reduced motion uses the kit's own handling
  // (globals.css cuts every animation to a single instant frame) and is also a
  // setting real users have, so the audit runs the way their browser would.
  await page.emulateMedia({ reducedMotion: "reduce" })

  // Measured at the full height of the page. axe judges colour contrast from
  // what is painted inside the viewport, and leaves everything below the first
  // screen "incomplete": neither failed nor passed, and so never counted here.
  // At the default size that hid real findings further down the dashboard, and
  // on settings the same finding came and went from one run to the next.
  await page.waitForLoadState("networkidle")
  const viewport = page.viewportSize()
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  await page.setViewportSize({
    width: viewport?.width ?? 1280,
    height: Math.min(Math.max(height, viewport?.height ?? 720), 16_000),
  })
  // Growing the viewport brings every scroll-triggered entrance into view at
  // once (the "Keep exploring" cards fade in). Scanned mid-fade, their text
  // measured as low contrast and failed the run now and then, while the page
  // at rest was clean. Wait for the animations to finish first.
  await page.waitForTimeout(100)
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), null, { timeout: 5_000 })
    .catch(() => {})
  await page.waitForTimeout(400)

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze()

  if (viewport) await page.setViewportSize(viewport)

  const blocking = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical"
  )
  const minor = results.violations.filter(
    (v) => v.impact !== "serious" && v.impact !== "critical"
  )

  for (const v of results.violations) {
    const where = v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")
    console.log(`[a11y] ${label} · ${v.impact} · ${v.id}: ${v.help} (${v.nodes.length}) → ${where}`)
  }
  if (minor.length) console.log(`[a11y] ${label}: ${minor.length} minor/moderate, not blocking`)

  expect(
    blocking,
    `${label}: ${blocking.map((v) => `${v.id} (${v.nodes.length})`).join(", ")}`
  ).toEqual([])
}

test.describe("accessibility", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path)
      await scan(page, name)
    })
  }

  test("the signed-in surfaces have none either", async ({ page }) => {
    // Nine pages scanned, plus a sign-up and a document sent: more than the
    // default 30 seconds on a dev server compiling each page on first visit,
    // which made this fail on time while every scan was clean.
    test.setTimeout(120_000)
    // The dashboard is where the kit spends most of its screen time, and it is
    // the part a marketing-page-only audit never reaches.
    await page.goto("/signup")
    await page.locator('input[name="email"]').fill(freshEmail())
    await page.locator('input[name="password"][type="password"]').fill(password)
    await page.getByRole("button", { name: /create account|sign up/i }).click()
    await page.waitForURL("**/dashboard", { timeout: 20_000 })

    await scan(page, "dashboard")

    await page.goto("/dashboard/settings")
    await scan(page, "settings")

    await page.goto("/dashboard/documents")
    await scan(page, "documents")

    await page.goto("/dashboard/billing")
    await scan(page, "billing")

    await page.goto("/dashboard/documents/new")
    await scan(page, "new document")

    await page.goto("/dashboard/payouts")
    await scan(page, "payouts")

    // The e-signature surfaces: a sent document, and the public signing page
    // a signer sees (no account, often on a phone).
    const signerEmail = esignEmail("a11y")
    const documentId = await quickSend(page, [signerEmail])
    await scan(page, "document detail")

    await page.goto("/dashboard/documents/quick-send")
    await scan(page, "quick send")

    await page.goto(`/sign/${await tokenFor(documentId, signerEmail)}`)
    await scan(page, "signing intro")
  })
})
