import { describe, expect, it } from "vitest"
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
