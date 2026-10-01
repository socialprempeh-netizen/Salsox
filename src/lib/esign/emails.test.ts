import { afterEach, describe, expect, it } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { createTranslator } from "next-intl"

/**
 * Every e-sign email message must format as a plain string.
 *
 * next-intl reads tags such as `<strong>` inside a message as rich-text
 * placeholders, and a plain `t()` call on such a message throws
 * FORMATTING_ERROR at send time: in production, on the first invite. Bold
 * markup therefore lives in src/lib/esign/emails.ts, not in the messages. This
 * formats each message with a value for every placeholder it declares, which
 * is what the email code does, so any tag that creeps back in fails here.
 */
const messages = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "locales", "en.json"), "utf8"))
const esignEmail = messages.esignEmail as Record<string, string>

describe("e-sign email messages", () => {
  const t = createTranslator({ locale: "en", messages, namespace: "esignEmail" })

  it("has messages to check", () => {
    expect(Object.keys(esignEmail).length).toBeGreaterThan(10)
  })

  for (const [key, message] of Object.entries(esignEmail)) {
    it(`${key} formats without markup errors`, () => {
      const values = Object.fromEntries([...message.matchAll(/\{(\w+)\}/g)].map((m) => [m[1], "<strong>x</strong>"]))
      const out = t(key as never, values as never)
      expect(out).not.toContain("esignEmail.")
      expect(message).not.toMatch(/<\/?[a-z]+>/)
    })
  }
})

/**
 * What each email outcome may be shown as. With no provider configured the
 * dashboard used to stamp everyone "Sent" and say "Each recipient got an
 * email", because `delivered` was also used to mean "an email went out".
 */
describe("email outcomes", async () => {
  const { delivered, emailConfigured, emailed } = await import("./emails")
  const key = process.env.RESEND_API_KEY
  afterEach(() => {
    if (key === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = key
  })

  it("counts only an accepted email as emailed", () => {
    expect(emailed("sent")).toBe(true)
    expect(emailed("notConfigured")).toBe(false)
    expect(emailed("failed")).toBe(false)
  })

  it("reports only a provider refusal as a failure", () => {
    expect(delivered("failed")).toBe(false)
    expect(delivered("notConfigured")).toBe(true)
  })

  it("knows whether a provider is configured", () => {
    delete process.env.RESEND_API_KEY
    expect(emailConfigured()).toBe(false)
    process.env.RESEND_API_KEY = ""
    expect(emailConfigured()).toBe(false)
    process.env.RESEND_API_KEY = "re_test"
    expect(emailConfigured()).toBe(true)
  })
})
