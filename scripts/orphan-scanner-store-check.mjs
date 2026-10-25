#!/usr/bin/env node
/**
 * Checks the packaged Orphan Page Scanner Chrome extension the way a user
 * would get it, and makes its Chrome Web Store images:
 *
 *   node scripts/package-orphan-scanner.mjs
 *   node scripts/orphan-scanner-store-check.mjs
 *
 * 1. Unzips dist/orphan-page-scanner-<version>.zip into a fresh folder and
 *    loads it unpacked in Chromium (Playwright), as "Load unpacked" does. A
 *    zip with a missing or broken file fails here, not in review.
 * 2. Serves a small demo site on localhost, reached as http://demo.example
 *    (Chromium's host resolver maps it), with a sitemap and three pages no
 *    other page links to, and runs a real scan from the popup through the
 *    background worker. The result must name exactly those three.
 * 3. Writes the store images to extensions/orphan-page-scanner/store-assets:
 *    two 1280x800 screenshots (the popup before and after a scan, framed)
 *    and the 440x280 promo tile, as JPEG, which the store takes without the
 *    alpha-channel question PNGs raise.
 *
 * Two things are stood in for, both browser chrome a script cannot click:
 * the toolbar button (the popup is opened as a page, told which tab it is
 * for) and Chrome's site-access prompt (answered yes; the demo site also
 * allows the requests by CORS). Exits non-zero on any failure.
 */
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { createServer } from "node:http"
import JSZip from "jszip"
import { chromium } from "@playwright/test"

const root = path.resolve(import.meta.dirname, "..")
const extDir = path.join(root, "extensions", "orphan-page-scanner")
const { version } = JSON.parse(fs.readFileSync(path.join(extDir, "manifest.json"), "utf8"))
const zipPath = path.join(root, "dist", `orphan-page-scanner-${version}.zip`)
const assets = path.join(extDir, "store-assets")
const SITE = "http://demo.example"
const PORT = 4600
const ORPHANS = ["/spring-sale-2025", "/old-pricing", "/team/hiring"]

const failures = []
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`)
  if (!ok) failures.push(name)
}

// ─── 1. Unzip what would be uploaded ─────────────────────────────────────────
if (!fs.existsSync(zipPath)) {
  console.error(`No ${path.relative(root, zipPath)}: run node scripts/package-orphan-scanner.mjs first.`)
  process.exit(1)
}
const unpacked = fs.mkdtempSync(path.join(os.tmpdir(), "orphan-scanner-"))
const zip = await JSZip.loadAsync(fs.readFileSync(zipPath))
for (const [name, entry] of Object.entries(zip.files)) {
  const target = path.join(unpacked, name)
  if (!target.startsWith(unpacked)) throw new Error(`zip entry escapes its folder: ${name}`)
  if (entry.dir) continue
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, await entry.async("nodebuffer"))
}
const manifest = JSON.parse(fs.readFileSync(path.join(unpacked, "manifest.json"), "utf8"))
const referenced = [manifest.background.service_worker, manifest.action.default_popup, ...Object.values(manifest.icons), ...Object.values(manifest.action.default_icon)]
check("every file the manifest names is in the zip", referenced.every((f) => fs.existsSync(path.join(unpacked, f))), referenced.filter((f) => !fs.existsSync(path.join(unpacked, f))).join(", "))

// ─── 2. A demo site with three orphans ───────────────────────────────────────
const linked = ["/", "/pricing", "/about", "/blog", "/blog/first-post", "/contact"]
const nav = `<nav>${["/", "/pricing", "/about", "/blog", "/contact"].map((p) => `<a href="${p}">${p}</a>`).join(" ")}</nav>`
const pages = {
  "/": `${nav}<a href="/blog/first-post">Read our first post</a>`,
  "/blog": `${nav}<a href="/blog/first-post">First post</a>`,
}
const server = createServer((req, res) => {
  const url = new URL(req.url, SITE)
  const headers = { "access-control-allow-origin": "*" }
  if (url.pathname === "/robots.txt") {
    res.writeHead(200, { ...headers, "content-type": "text/plain" })
    return res.end(`User-agent: *\nSitemap: ${SITE}/sitemap.xml\n`)
  }
  if (url.pathname === "/sitemap.xml") {
    res.writeHead(200, { ...headers, "content-type": "application/xml" })
    return res.end(`<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...linked, ...ORPHANS].map((p) => `<url><loc>${SITE}${p}</loc></url>`).join("")}</urlset>`)
  }
  if (linked.includes(url.pathname) || ORPHANS.includes(url.pathname)) {
    res.writeHead(200, { ...headers, "content-type": "text/html" })
    return res.end(`<!doctype html><title>${url.pathname}</title>${pages[url.pathname] ?? nav}`)
  }
  res.writeHead(404, headers)
  res.end()
})
await new Promise((resolve) => server.listen(PORT, resolve))

// ─── 3. Load unpacked and scan ───────────────────────────────────────────────
const context = await chromium.launchPersistentContext("", {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${unpacked}`, `--load-extension=${unpacked}`, `--host-resolver-rules=MAP demo.example 127.0.0.1:${PORT}`],
})
const errors = []
try {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  const extensionId = new URL(worker.url()).host
  check("loads unpacked; background worker starts", Boolean(extensionId))
  check("loaded version is the manifest's", (await worker.evaluate(() => chrome.runtime.getManifest().version)) === version, version)

  const popup = await context.newPage()
  popup.on("pageerror", (e) => errors.push(e.message))
  popup.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  // The toolbar button and the site-access prompt, which a script cannot click.
  await popup.addInitScript((site) => {
    chrome.tabs.query = async () => [{ url: `${site}/` }]
    chrome.permissions.request = async () => true
  }, SITE)
  await popup.setViewportSize({ width: 380, height: 600 })
  await popup.goto(`chrome-extension://${extensionId}/popup.html`)
  await popup.locator("#start").waitFor()
  check("popup opens on the start screen for the tab's site", (await popup.locator("#origin").textContent()) === SITE)
  const before = await popup.locator("body").screenshot()

  await popup.locator("#limit").selectOption("100")
  await popup.locator("#scan").click()
  await popup.locator("#result").waitFor({ timeout: 60_000 })
  const found = await popup.locator("#orphans a").evaluateAll((links) => links.map((a) => new URL(a.href).pathname).sort())
  check("real scan finds exactly the three orphans", JSON.stringify(found) === JSON.stringify([...ORPHANS].sort()), found.join(", "))
  check("counts the whole sitemap", (await popup.locator("#t-listed").textContent()) === String(linked.length + ORPHANS.length))
  check("no page failed to load", (await popup.locator("#t-failed").textContent()) === "0")
  const download = popup.waitForEvent("download")
  await popup.locator("#csv").click()
  const csv = fs.readFileSync(await (await download).path(), "utf8")
  check("CSV export has a row per page", csv.trim().split("\n").length === linked.length + ORPHANS.length + 1)
  const after = await popup.locator("body").screenshot()
  check("no errors in the popup", errors.length === 0, errors.join(" | "))

  // ─── 4. Store images ───────────────────────────────────────────────────────
  fs.mkdirSync(assets, { recursive: true })
  const icon = fs.readFileSync(path.join(unpacked, "icons", "icon-128.png")).toString("base64")
  const frame = (shot, title, body) => `<!doctype html><html><body style="margin:0;width:1280px;height:800px;display:flex;align-items:center;gap:72px;padding:0 96px;box-sizing:border-box;background:#f8f5f3;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#242424">
    <div style="flex:1">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:28px"><img src="data:image/png;base64,${icon}" width="48" height="48"><span style="font-size:20px;font-weight:700">Orphan Page Scanner</span></div>
      <h1 style="font-size:40px;line-height:1.12;margin:0 0 20px;letter-spacing:-0.02em">${title}</h1>
      <p style="font-size:21px;line-height:1.5;margin:0;color:#5e5c59;max-width:520px">${body}</p>
    </div>
    <img src="data:image/png;base64,${shot.toString("base64")}" style="width:420px;border:1px solid #e4ddd6;box-shadow:0 24px 60px rgba(36,36,36,.14)">
  </body></html>`
  const canvas = await context.newPage()
  const shots = [
    ["screenshot-1-result.jpg", after, "Find the pages nothing links to", "Every page in your sitemap, checked for links from the rest of your site. Orphans are listed, ready to fix or export as CSV."],
    ["screenshot-2-start.jpg", before, "One click, on the site you are on", "Reads the sitemap, opens each page and counts the links between them. Only that site is contacted; nothing is sent anywhere else."],
  ]
  for (const [file, shot, title, body] of shots) {
    await canvas.setViewportSize({ width: 1280, height: 800 })
    await canvas.setContent(frame(shot, title, body))
    await canvas.screenshot({ path: path.join(assets, file), type: "jpeg", quality: 92 })
  }
  await canvas.setViewportSize({ width: 440, height: 280 })
  await canvas.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;box-sizing:border-box;padding:36px;background:#0e6b63;color:#fff;font-family:Inter,'Segoe UI',system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between">
    <img src="data:image/png;base64,${icon}" width="56" height="56" style="background:#fff;padding:6px">
    <div><div style="font-size:30px;font-weight:700;letter-spacing:-0.02em;line-height:1.1">Orphan Page Scanner</div>
    <div style="font-size:16px;margin-top:10px;opacity:.9">Find the sitemap pages nothing links to. Free, private, in your browser.</div></div>
  </body></html>`)
  await canvas.screenshot({ path: path.join(assets, "promo-tile-440x280.jpg"), type: "jpeg", quality: 92 })
  console.log(`\nStore images written to ${path.relative(root, assets)}`)
} finally {
  await context.close()
  server.close()
  fs.rmSync(unpacked, { recursive: true, force: true })
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`)
  process.exit(1)
}
console.log("\nAll checks passed")
