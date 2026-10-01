import { describe, expect, it } from "vitest"
import { documentSetupSchema, fieldInputSchema, nameFromEmail, parseEmailList } from "./schemas"

describe("parseEmailList", () => {
  it("accepts commas, semicolons, new lines and display names", () => {
    const { emails, invalid } = parseEmailList('ama@x.com; Kofi <KOFI@y.com>\n"Esi A" <esi@z.com>, ama@x.com')
    expect(emails).toEqual([
      { email: "ama@x.com" },
      { email: "kofi@y.com", name: "Kofi" },
      { email: "esi@z.com", name: "Esi A" },
    ])
    expect(invalid).toEqual([])
  })
  it("reports invalid fragments", () => {
    expect(parseEmailList("nope, a@b.co").invalid).toEqual(["nope"])
  })
})

describe("nameFromEmail", () => {
  it("title-cases the local part", () => {
    expect(nameFromEmail("ama.mensah@x.com")).toBe("Ama Mensah")
  })
})

describe("fieldInputSchema", () => {
  it("rejects a field that runs off the page", () => {
    const base = { recipientKey: "r1", type: "TEXT", page: 1, x: 90, y: 10, width: 20, height: 5 }
    expect(fieldInputSchema.safeParse(base).success).toBe(false)
    expect(fieldInputSchema.safeParse({ ...base, x: 70 }).success).toBe(true)
  })
})

describe("documentSetupSchema", () => {
  it("normalises emails and applies defaults", () => {
    const parsed = documentSetupSchema.parse({
      title: " NDA ",
      recipients: [{ key: "r1", name: "Ama", email: " AMA@X.COM " }],
      fields: [],
    })
    expect(parsed.title).toBe("NDA")
    expect(parsed.recipients[0]).toMatchObject({ email: "ama@x.com", role: "SIGNER", order: 0 })
    expect(parsed.signingOrder).toBe("PARALLEL")
    expect(parsed.expiresInDays).toBe(30)
    expect(parsed.payment).toBeNull()
  })
  it("needs at least one recipient", () => {
    expect(documentSetupSchema.safeParse({ title: "x", recipients: [], fields: [] }).success).toBe(false)
  })
})

describe("documentSetupSchema payment currency", () => {
  const setup = (currency: string) => ({
    title: "Invoice",
    recipients: [{ key: "r1", name: "Ama", email: "ama@x.com" }],
    fields: [],
    payment: { amount: "12.50", currency, recipientKey: "r1" },
  })

  it("accepts an offered currency, in any case", () => {
    expect(documentSetupSchema.parse(setup(" ghs ")).payment?.currency).toBe("GHS")
    expect(documentSetupSchema.parse(setup("usd")).payment?.currency).toBe("USD")
  })

  // The exploit: amounts are stored in hundredths, so a zero-decimal currency
  // would charge 1,250 yen for a payment shown as 12.50.
  it("refuses a crafted zero-decimal currency, and any code not offered", () => {
    for (const currency of ["JPY", "KRW", "XOF", "BHD", "ABC", "US"]) {
      expect(documentSetupSchema.safeParse(setup(currency)).success).toBe(false)
    }
  })
})
