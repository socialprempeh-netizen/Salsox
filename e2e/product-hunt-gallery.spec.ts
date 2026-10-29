import { test, expect, type Page } from "@playwright/test"
import path from "node:path"
import fs from "node:fs"
import sharp from "sharp"
import { db, giveBusinessPlan, quickSend, samplePdf, signUp, tokenFor } from "./helpers/esign"

/**
 * The Product Hunt gallery (docs/product-hunt/gallery/): five 1270x760
 * images built from screenshots of the real product, never drawn:
 *
 *   PH_GALLERY=1 npx playwright test e2e/product-hunt-gallery.spec.ts --project=chromium
 *
 * Skipped in the normal suite. The homepage and the pricing page are taken
 * from the live site (PH_SITE_URL, default https://salsox.com), read only.
 * Quick Send, the phone signing view and Sign & Pay are taken from the app
 * this suite runs against (a local server on a throwaway database): a
 * throwaway sender on the Business plan Quick Sends a generated agreement to
 * fictional people (example.com addresses, IPs from the 203.0.113.0/24
 * documentation range); no email is sent and no payment is taken (the Sign
 * & Pay screen is the signer's view before paying). Signing links are
 * masked and Next's development badge is hidden.
 *
 * Each screenshot is then framed on the site's own colours with one line of
 * copy (every claim true of the product today: see docs/product-hunt/), at
 * twice the size and scaled down, so text stays sharp at 1270x760. Square
 * corners throughout; the logo is the real mark (public/brand/mark.png).
 */

const SITE = (process.env.PH_SITE_URL ?? "https://salsox.com").replace(/\/$/, "")
const OUT = path.join(process.cwd(), "docs", "product-hunt", "gallery")
const SHOTS = path.join(OUT, ".shots")
const SENDER = "ama.mensah@example.com"
const SIGNER = "kofi.boateng@example.com"
const W = 1270, H = 760

const removeSender = () => db().user.deleteMany({ where: { email: SENDER } })
const hideDevBadge = (page: Page) => page.addStyleTag({ content: "nextjs-portal{display:none!important}" })
const linkMasks = (page: Page) => [page.locator('input[value*="/sign/"]'), page.locator('a[href*="/sign/"]:not([href$="/download"])')]
const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.42" } }
const dataUrl = (file: string) => `data:image/png;base64,${fs.readFileSync(file).toString("base64")}`

/**
 * One gallery slide: the mark and name, a headline and a line under it on
 * the left, the screenshots on the right in square, bordered frames. The
 * site's palette (teal #0f766e on the warm off-white #f8f5f3) and its type
 * (Fraunces for headings, Inter for text).
 */
function slide({ headline, line, shots, phoneShots = false, stacked = false }: { headline: string; line: string; shots: string[]; phoneShots?: boolean; stacked?: boolean }) {
  const frames = shots.map((s) => `<figure class="${phoneShots ? "phone" : "wide"}"><img src="${dataUrl(s)}" alt=""></figure>`).join("")
  return `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Inter:wght@400;500&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:${W}px;height:${H}px;background:#f8f5f3;color:#242424;font-family:Inter,system-ui,sans-serif;display:grid;grid-template-columns:${phoneShots ? "470px 1fr" : "400px 1fr"};gap:40px;padding:56px 0 56px 64px;overflow:hidden}
  .copy{display:flex;flex-direction:column;justify-content:center;gap:22px}
  .brand{display:flex;align-items:center;gap:12px;font-family:Fraunces,serif;font-size:26px;font-weight:600;color:#242424}
  .brand img{width:44px;height:44px}
  h1{font-family:Fraunces,serif;font-weight:600;font-size:${phoneShots ? 46 : 42}px;line-height:1.08;letter-spacing:-0.01em;color:#242424}
  p{font-size:19px;line-height:1.5;color:#5e5c59;max-width:400px}
  .rule{width:56px;height:4px;background:#0f766e}
  .shots{display:flex;align-items:center;gap:28px;justify-content:${phoneShots ? "center" : "flex-start"};min-width:0}
  figure{background:#fff;border:1px solid #e4ddd6;box-shadow:0 18px 40px -24px rgba(36,36,36,.35);overflow:hidden}
  figure.wide{width:${W - 64 - 400 - 40 + 24}px;max-height:${H - 112}px}
  figure.wide img{display:block;width:100%;height:auto}
  .shots.stacked{flex-direction:column;align-items:flex-start;justify-content:center;gap:18px}
  figure.phone{width:300px}
  figure.phone img{display:block;width:100%;height:auto}
</style></head><body>
<div class="copy">
  <div class="brand"><img src="${dataUrl(path.join(process.cwd(), "public", "brand", "mark.png"))}" alt="">Salsox</div>
  <div class="rule"></div>
  <h1>${headline}</h1>
  <p>${line}</p>
</div>
<div class="shots${stacked ? " stacked" : ""}">${frames}</div>
</body></html>`
}

/** Renders a slide at twice the size and scales it to exactly 1270x760. */
async function render(page: Page, html: string, name: string) {
  await page.setContent(html, { waitUntil: "networkidle" })
  await page.evaluate(() => document.fonts.ready)
  const big = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } })
  await sharp(big).resize(W, H).png().toFile(path.join(OUT, name))
}

test.skip(!process.env.PH_GALLERY, "set PH_GALLERY=1 to build the Product Hunt gallery")

test("Product Hunt gallery", async ({ browser }) => {
  test.setTimeout(300_000)
  fs.mkdirSync(SHOTS, { recursive: true })

  // 1 and 5: the live homepage and pricing page, read only. The analytics
  // cookie banner is declined first (in this browser only), so it covers nothing.
  const decline = async (page: Page) => {
    const button = page.getByRole("button", { name: "Decline" })
    if (await button.count()) await button.first().click()
  }
  // The homepage as a phone shows it, down to just above the hero's
  // illustrated dashboard: its figures are artwork, not real numbers, and a
  // launch gallery must not read as if they were.
  const livePhone = await browser.newContext({ ...phone, extraHTTPHeaders: {} })
  const home = await livePhone.newPage()
  await home.goto(SITE, { waitUntil: "networkidle" })
  await decline(home)
  await home.waitForTimeout(1000)
  const cut = await home.getByText("See how it works").first().boundingBox()
  await home.screenshot({ path: path.join(SHOTS, "home-phone.png"), clip: { x: 0, y: 0, width: 390, height: Math.ceil((cut?.y ?? 600) + (cut?.height ?? 24) + 28) } })
  await livePhone.close()
  // The plan cards, from the Monthly/Yearly switch down.
  const live = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })
  const site = await live.newPage()
  await site.goto(`${SITE}/pricing`, { waitUntil: "networkidle" })
  await decline(site)
  // The page's own heading and the line under it, which states the free plan
  // ("Start free with 3 documents a month"): the plan cards list only the paid plans.
  const heading = (await site.locator("main h1").first().boundingBox())!
  const lede = (await site.locator("main h1 ~ p, main h1 + * p").first().boundingBox())!
  await site.screenshot({ path: path.join(SHOTS, "pricing-intro.png"), clip: { x: 60, y: heading.y - 20, width: 1150, height: lede.y + lede.height - heading.y + 40 } })
  const toggle = site.getByRole("button", { name: "Monthly", exact: true }).first()
  await toggle.scrollIntoViewIfNeeded()
  const top = (await toggle.boundingBox())!.y
  await site.evaluate((dy) => window.scrollBy(0, dy), top - 90)
  await site.waitForTimeout(900)
  await site.screenshot({ path: path.join(SHOTS, "pricing.png"), clip: { x: 60, y: 70, width: 1150, height: 620 } })
  await live.close()

  // 2: Quick Send, filled in, on a laptop-sized screen.
  await removeSender()
  const senderCtx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, extraHTTPHeaders: { "x-forwarded-for": "203.0.113.7" } })
  const sender = await senderCtx.newPage()
  await giveBusinessPlan(await signUp(sender, SENDER))
  await sender.goto("/dashboard/documents/quick-send")
  await hideDevBadge(sender)
  await sender.locator('input[type="file"]').setInputFiles({ name: "Website design agreement.pdf", mimeType: "application/pdf", buffer: await samplePdf() })
  await sender.getByLabel("Who needs to sign?").fill(SIGNER)
  await sender.waitForTimeout(600)
  await sender.locator("main").screenshot({ path: path.join(SHOTS, "quick-send.png") })

  // 3: the signer on a phone, from the link Quick Send made.
  const documentId = await quickSend(sender, [SIGNER], "Website design agreement")
  const signerCtx = await browser.newContext(phone)
  const signer = await signerCtx.newPage()
  await signer.goto(`/sign/${await tokenFor(documentId, SIGNER)}`)
  await expect(signer.getByRole("heading", { name: "Website design agreement" })).toBeVisible()
  await hideDevBadge(signer)
  await signer.waitForTimeout(600)
  await signer.screenshot({ path: path.join(SHOTS, "phone-start.png"), mask: linkMasks(signer) })
  await signer.getByRole("checkbox").check()
  await signer.getByRole("button", { name: "Review and sign" }).click()
  await expect(signer.locator("canvas").first()).toBeVisible({ timeout: 30_000 })
  await expect(signer.getByText("Loading document…")).toHaveCount(0)
  await signer.getByRole("button", { name: "Start" }).click()
  await signer.getByRole("tab", { name: "Type" }).click()
  await signer.waitForTimeout(600)
  await signer.screenshot({ path: path.join(SHOTS, "phone-adopt.png") })

  // 4: Sign & Pay, the signer's view of a document that collects a payment.
  const paid = await quickSend(sender, ["yaw.boateng@example.com"], "Kitchen refit deposit")
  await db().document.update({ where: { id: paid }, data: { paymentAmount: 45_000, paymentCurrency: "USD", paymentProvider: "STRIPE" } })
  await db().recipient.updateMany({ where: { documentId: paid }, data: { mustPay: true } })
  await signer.goto(`/sign/${await tokenFor(paid, "yaw.boateng@example.com")}`)
  await expect(signer.getByRole("heading", { name: "Kitchen refit deposit" })).toBeVisible()
  await hideDevBadge(signer)
  await signer.waitForTimeout(600)
  await signer.screenshot({ path: path.join(SHOTS, "phone-pay.png"), mask: linkMasks(signer) })

  await signerCtx.close()
  await senderCtx.close()
  await removeSender()

  // The five slides.
  const canvas = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage()
  await render(canvas, slide({ headline: "Send, sign and get paid, from any phone", line: "E-signatures for small businesses: send any PDF, let people sign on their phone, and collect payment in the same step.", shots: [path.join(SHOTS, "home-phone.png")], phoneShots: true }), "1-hero.png")
  await render(canvas, slide({ headline: "Quick Send: a PDF and an email address", line: "Upload any PDF, type who signs, and send. The signature fields are placed for you.", shots: [path.join(SHOTS, "quick-send.png")] }), "2-quick-send.png")
  await render(canvas, slide({ headline: "Signed on a phone, with no account", line: "Signers open the link in their browser and sign one field at a time. No app, no sign-up.", shots: [path.join(SHOTS, "phone-start.png"), path.join(SHOTS, "phone-adopt.png")], phoneShots: true }), "3-mobile-signing.png")
  await render(canvas, slide({ headline: "Sign & Pay: get paid as they sign", line: "On the Business plan, a document can collect a payment during signing: by card through Stripe, or card and mobile money through Paystack.", shots: [path.join(SHOTS, "phone-pay.png")], phoneShots: true }), "4-sign-and-pay.png")
  await render(canvas, slide({ headline: "Free to start: 3 documents a month", line: "The free plan sends 3 documents a month for signature. Paid plans send unlimited documents.", shots: [path.join(SHOTS, "pricing-intro.png"), path.join(SHOTS, "pricing.png")], stacked: true }), "5-pricing.png")

  // The 240x240 thumbnail Product Hunt asks for, from the same mark.
  await sharp(path.join(process.cwd(), "public", "brand", "mark.png")).resize(240, 240).png().toFile(path.join(OUT, "thumbnail-240.png"))
  fs.rmSync(SHOTS, { recursive: true, force: true })

  for (const f of ["1-hero.png", "2-quick-send.png", "3-mobile-signing.png", "4-sign-and-pay.png", "5-pricing.png"]) {
    const meta = await sharp(path.join(OUT, f)).metadata()
    expect([meta.width, meta.height], f).toEqual([W, H])
  }
})
