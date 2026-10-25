import { test, expect } from "@playwright/test"
import { createServer, type Server } from "node:http"
import { createHmac, timingSafeEqual } from "node:crypto"
import { expectNoHorizontalScroll, freshEmail, samplePdf, signUp, tokenFor } from "./helpers/esign"

/**
 * Webhooks and the public API, end to end, as an integration uses them:
 *
 * 1. The sender creates an API key on the Developers page (the key is read
 *    off the screen, as a person would copy it).
 * 2. A receiver on localhost subscribes through POST /api/v1/webhooks, the
 *    REST-hook call Zapier makes, for every event.
 * 3. Two documents are sent through POST /api/v1/documents. A real signer
 *    opens and signs the first in a phone browser; another declines the
 *    second.
 * 4. Every delivery must arrive with a signature that checks out under the
 *    published algorithm (written out here from the Help Center article, not
 *    imported, so the docs are what is tested): document.sent twice, then
 *    viewed, signed, completed for the first and viewed, declined for the
 *    second, each about the right document and recipient.
 * 5. GET /api/v1/events returns the same events from the account's history,
 *    and the Developers page lists the deliveries as delivered at phone width.
 *
 * document.expired and payment.sent need a lapsed link and a real payment;
 * their payloads come from the same builder and are covered by unit tests.
 */

const RECEIVER_PORT = 4557
type Received = { event: string; id: string; valid: boolean; body: { data: { document: { id: string; status: string }; recipient: { email: string } | null } } }

/** The receiver's check, exactly as /resources/help/webhooks-and-api publishes it. */
function verify(secret: string, header: string, body: string): boolean {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")))
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false
  const expected = createHmac("sha256", secret).update(`${t}.${body}`).digest()
  const given = Buffer.from(v1, "hex")
  return given.length === expected.length && timingSafeEqual(given, expected)
}

test.describe.configure({ timeout: 240_000 })

test("webhooks and the API: subscribe, send, sign, decline, all delivered and signed", async ({ page, browser }) => {
  const received: Received[] = []
  let secret = ""
  const server: Server = createServer((req, res) => {
    let raw = ""
    req.on("data", (c) => (raw += c))
    req.on("end", () => {
      const body = JSON.parse(raw)
      received.push({ event: String(req.headers["webhook-event"]), id: String(req.headers["webhook-id"]), valid: verify(secret, String(req.headers["webhook-signature"]), raw) && body.id === req.headers["webhook-id"], body })
      res.writeHead(200)
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(RECEIVER_PORT, resolve))

  try {
    // 1. A key, from the Developers page.
    await signUp(page)
    await page.goto("/dashboard/developers")
    await page.getByLabel("Key name").fill("Zapier")
    await page.getByRole("button", { name: "Create key" }).click()
    const key = (await page.getByRole("status").locator("code").textContent())?.trim() ?? ""
    expect(key).toMatch(/^ak_/)
    const api = (path: string, init: RequestInit = {}) =>
      fetch(new URL(`/api/v1${path}`, page.url()), { ...init, headers: { authorization: `Bearer ${key}`, "content-type": "application/json", ...init.headers } })

    // 2. Subscribe, the REST-hook way.
    const me = await (await api("/me")).json()
    expect(me.email).toBeTruthy()
    const sub = await api("/webhooks", { method: "POST", body: JSON.stringify({ url: `http://localhost:${RECEIVER_PORT}/hook`, events: ["document.sent", "document.viewed", "document.signed", "document.completed", "document.declined"] }) })
    expect(sub.status).toBe(201)
    secret = (await sub.json()).secret
    expect(secret).toBeTruthy()

    // 3. Send two documents through the API, as uploads.
    const send = async (title: string, signer: string) => {
      const form = new FormData()
      form.set("file", new File([new Uint8Array(await samplePdf())], `${title}.pdf`, { type: "application/pdf" }))
      form.set("data", JSON.stringify({ recipients: [{ email: signer, name: "Kofi Boateng" }] }))
      const res = await fetch(new URL("/api/v1/documents", page.url()), { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form })
      expect(res.status, await res.clone().text()).toBe(201)
      return (await res.json()).id as string
    }
    const signerEmail = freshEmail("signer")
    const declinerEmail = freshEmail("decliner")
    const signedId = await send("Service agreement", signerEmail)
    const declinedId = await send("Supply contract", declinerEmail)

    const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
    const signerCtx = await browser.newContext(phone)
    const signer = await signerCtx.newPage()
    await signer.goto(`/sign/${await tokenFor(signedId, signerEmail)}`)
    await signer.getByRole("checkbox").check()
    await signer.getByRole("button", { name: "Review and sign" }).click()
    await signer.getByRole("button", { name: "Start" }).click()
    await signer.getByRole("tab", { name: "Type" }).click()
    await signer.getByRole("button", { name: "Adopt and sign" }).click()
    await signer.getByRole("button", { name: /Next field/ }).click()
    await signer.getByRole("button", { name: "Save" }).click()
    await signer.getByRole("button", { name: "Finish signing" }).click()
    await expect(signer.getByRole("heading", { name: "You've signed" })).toBeVisible({ timeout: 30_000 })

    await signer.goto(`/sign/${await tokenFor(declinedId, declinerEmail)}`)
    await signer.getByRole("button", { name: "Decline to sign" }).or(signer.getByRole("link", { name: "Decline to sign" })).first().click()
    await signer.getByPlaceholder("Reason (optional)").fill("Wrong delivery date.")
    await signer.getByRole("button", { name: "Decline", exact: true }).click()
    await signerCtx.close()

    // 4. Every delivery arrived, signed, about the right document.
    const expected: [string, string, string | null][] = [
      ["document.sent", signedId, null],
      ["document.sent", declinedId, null],
      ["document.viewed", signedId, signerEmail],
      ["document.signed", signedId, signerEmail],
      ["document.completed", signedId, null],
      ["document.viewed", declinedId, declinerEmail],
      ["document.declined", declinedId, declinerEmail],
    ]
    await expect.poll(() => received.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(expected.length)
    for (const [event, documentId, recipient] of expected) {
      const hit = received.find((r) => r.event === event && r.body.data.document.id === documentId)
      expect(hit, `${event} for ${documentId}`).toBeTruthy()
      expect(hit!.valid, `${event}: signature`).toBe(true)
      expect(hit!.body.data.recipient?.email ?? null, `${event}: recipient`).toBe(recipient)
    }
    expect(received).toHaveLength(expected.length)
    expect(new Set(received.map((r) => r.id)).size, "every event has its own id").toBe(expected.length)
    expect(received.find((r) => r.event === "document.completed")!.body.data.document.status).toBe("COMPLETED")

    // 5. The same history through the API, and on the Developers page.
    const recent = await (await api("/events?event=document.sent&limit=5")).json()
    expect(recent.map((e: { data: { document: { id: string } } }) => e.data.document.id).sort()).toEqual([signedId, declinedId].sort())
    const found = await (await api(`/documents?status=declined`)).json()
    expect(found.data.map((d: { id: string }) => d.id)).toEqual([declinedId])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/dashboard/developers")
    await expect(page.getByText("Delivered").first()).toBeVisible()
    await expectNoHorizontalScroll(page, "developers with deliveries @390")
    await page.setViewportSize({ width: 360, height: 800 })
    await expectNoHorizontalScroll(page, "developers with deliveries @360")
  } finally {
    server.close()
  }
})
