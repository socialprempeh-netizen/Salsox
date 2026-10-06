/**
 * Tests for SMS reminders (sms.ts): the feature is off unless real-looking
 * credentials are set, numbers are never guessed into a country, and a
 * provider failure is reported rather than thrown.
 */
import { describe, expect, it, vi } from "vitest"

vi.mock("next-intl/server", () => ({ getTranslations: async () => () => "" }))

import { sendSms, shortTitle, smsConfig, smsConfigured } from "./sms"

const SID = `AC${"0123456789abcdef".repeat(2)}`
const TOKEN = "f".repeat(32)
const MG = `MG${"a".repeat(32)}`
const live = { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM_NUMBER: "+15005550006" }

describe("smsConfig", () => {
  it("is on with a sid, a token and a sender number", () => {
    expect(smsConfig(live)).toEqual({ accountSid: SID, authToken: TOKEN, from: "+15005550006", messagingServiceSid: null })
  })

  it("prefers a messaging service over a sender number", () => {
    expect(smsConfig({ ...live, TWILIO_MESSAGING_SERVICE_SID: MG })?.messagingServiceSid).toBe(MG)
  })

  // Graceful degradation: what .env.example ships, and every half-filled
  // variant of it, means "no SMS", never a broken send.
  it("is off with nothing set, with placeholders, or with a piece missing", () => {
    expect(smsConfigured({})).toBe(false)
    expect(smsConfigured({ TWILIO_ACCOUNT_SID: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", TWILIO_AUTH_TOKEN: "your_auth_token", TWILIO_FROM_NUMBER: "+15551234567" })).toBe(false)
    expect(smsConfigured({ ...live, TWILIO_AUTH_TOKEN: "" })).toBe(false)
    expect(smsConfigured({ ...live, TWILIO_FROM_NUMBER: "0244123456" })).toBe(false)
  })

  it("can be switched off with the credentials still in place", () => {
    expect(smsConfigured({ ...live, SMS_REMINDERS_ENABLED: "false" })).toBe(false)
    expect(smsConfigured({ ...live, SMS_REMINDERS_ENABLED: "true" })).toBe(true)
  })
})

describe("shortTitle", () => {
  it("keeps short titles and shortens long ones with an ellipsis", () => {
    expect(shortTitle("Lease")).toBe("Lease")
    const long = shortTitle("A very long employment agreement title that goes on and on")
    expect(long.length).toBeLessThanOrEqual(40)
    expect(long.endsWith("…")).toBe(true)
  })
})

describe("sendSms", () => {
  const config = smsConfig(live)

  it("posts to the provider with basic auth and reports success", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 201 }))
    expect(await sendSms("+233 20 123 4567", "hello", config, fetchImpl as never)).toBe("sent")
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`)
    expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from(`${SID}:${TOKEN}`).toString("base64")}`)
    const body = new URLSearchParams(String(init.body))
    expect(body.get("To")).toBe("+233201234567")
    expect(body.get("From")).toBe("+15005550006")
    expect(body.get("Body")).toBe("hello")
  })

  it("sends nothing without a configuration", async () => {
    const fetchImpl = vi.fn()
    expect(await sendSms("+233201234567", "hello", null, fetchImpl as never)).toBe("notConfigured")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("reports a refusal or a network failure without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await sendSms("+233201234567", "x", config, (async () => new Response("bad", { status: 400 })) as never)).toBe("failed")
    expect(await sendSms("+233201234567", "x", config, (async () => { throw new Error("offline") }) as never)).toBe("failed")
    expect(await sendSms("0201234567", "x", config, vi.fn() as never)).toBe("failed")
  })
})
