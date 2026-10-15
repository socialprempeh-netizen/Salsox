import { test } from "@playwright/test"
import fs from "node:fs"
import { OBSERVE, measureLoad, throttle, type Result } from "./helpers/perf"

/**
 * Salsox's public pages next to PandaDoc's and DocuSign's, measured the same
 * way as e2e/perf.spec.ts (helpers/perf.ts): cold loads as a mid-range phone
 * (4x CPU slowdown, slow 4G) and as an unthrottled desktop.
 *
 * Why this exists: to compare like with like. Every site is loaded from the
 * same machine over the same internet path, so Salsox is measured on its live
 * domain here, not on a local build. Only public pages that need no account
 * are compared, one of each kind on every site: the home page, pricing, the
 * sign-in page and the e-signature product page. Neither competitor offers a
 * document to view or sign without an account.
 *
 * Polite by design: a handful of page loads per site per run, no crawling,
 * nothing submitted, and no attempt to get past any bot protection. A page
 * that refuses the request is recorded as such.
 *
 * Opt-in: runs only with PERF_REPORT set to a file path for the results.
 * SALSOX_URL overrides the Salsox origin (defaults to the live site).
 */

const report = process.env.PERF_REPORT
test.skip(!report, "set PERF_REPORT to measure")
test.describe.configure({ mode: "serial" })

const salsox = (process.env.SALSOX_URL ?? "https://salsox.com").replace(/\/$/, "")

/** One page of each kind per site; the same four kinds everywhere. */
const SITES: Record<string, Record<string, string>> = {
  Salsox: {
    home: `${salsox}/`,
    pricing: `${salsox}/pricing`,
    "sign in": `${salsox}/login`,
    "e-signature product page": `${salsox}/electronic-signature-software`,
  },
  PandaDoc: {
    home: "https://www.pandadoc.com/",
    pricing: "https://www.pandadoc.com/pricing/",
    "sign in": "https://app.pandadoc.com/login/",
    "e-signature product page": "https://www.pandadoc.com/electronic-signature-software/",
  },
  DocuSign: {
    home: "https://www.docusign.com/",
    pricing: "https://ecom.docusign.com/plans-and-pricing/esignature",
    "sign in": "https://account.docusign.com/",
    "e-signature product page": "https://www.docusign.com/products/electronic-signature",
  },
}

const results: Result[] = []
const save = () => fs.writeFileSync(report!, JSON.stringify(results, null, 2))

for (const profile of ["desktop", "mobile"] as const) {
  test(`competitor benchmark: ${profile}`, async ({ browser }) => {
    test.setTimeout(1_800_000)
    const viewport = profile === "mobile" ? { width: 412, height: 823 } : { width: 1350, height: 940 }
    const ctx = await browser.newContext({ viewport, isMobile: profile === "mobile", hasTouch: profile === "mobile" })
    await ctx.addInitScript(OBSERVE)
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)

    for (const [site, pages] of Object.entries(SITES)) {
      for (const [kind, url] of Object.entries(pages)) {
        await throttle(cdp, "desktop")
        await page.goto("about:blank")
        await throttle(cdp, profile)
        try {
          // 15s for the network to settle: live sites keep analytics
          // connections open, and every site gets the same allowance.
          await measureLoad(page, cdp, `${site} · ${kind}`, url, profile, (r) => results.push({ ...r, site, kind }), { idleTimeout: 15_000 })
        } catch (error) {
          results.push({ profile, site, kind, page: `${site} · ${kind}`, error: String(error).slice(0, 120) })
        }
        save()
      }
    }
    await ctx.close()
  })
}
