/**
 * The Zapier app's pure helpers (lib/): the plain-language errors, the
 * request bodies the two actions send, the search query, and the trigger
 * samples, which must keep the exact shape of Salsox's own webhook sample
 * (samplePayload in src/lib/webhooks/payload.ts) so a Zap built on the
 * sample maps a real delivery the same way.
 */
import { describe, expect, it } from "vitest"
import { samplePayload } from "../../../src/lib/webhooks/payload"
import { fakeZ, load } from "./helpers.mjs"

const { addApiKey, cleanMessage, describeError, handleErrors } = load("../lib/api.js")
const { pdfBody } = load("../lib/pdf.js")
const { searchParams } = load("../lib/search.js")
const { sampleEvent } = load("../lib/samples.js")
const { templateChoices, parseChoice, templateFor } = load("../lib/templates.js")

describe("errors", () => {
  it("asks the person to reconnect when the key is refused", () => {
    expect(describeError(401, null)).toMatchObject({ kind: "auth", message: expect.stringMatching(/reconnect/) })
  })

  it("stops softly at a plan limit, and lets Zapier retry when throttled", () => {
    expect(describeError(402, { error: { code: "planLimit", message: "You have used this month's free documents." } })).toEqual({ kind: "halted", message: "You have used this month's free documents." })
    expect(describeError(429, null).kind).toBe("throttled")
  })

  it("explains a PDF link Salsox could not download", () => {
    expect(describeError(422, { error: { code: "file_url", message: "`file_url` could not be fetched." } }).message).toMatch(/could not download the PDF/)
  })

  it("turns developer wording into the field names people see", () => {
    expect(cleanMessage("`expires_in_days` must be between 1 and 365.")).toBe("days until the link expires must be between 1 and 365.")
    expect(cleanMessage("`some_field` is wrong")).toBe("some field is wrong")
  })

  it("raises the matching Zapier error, and lets an unsubscribe opt out", () => {
    const { z } = fakeZ()
    expect(() => handleErrors({ status: 401, data: {} }, z)).toThrow(z.errors.ExpiredAuthError)
    expect(() => handleErrors({ status: 402, data: {} }, z)).toThrow(z.errors.HaltedError)
    expect(() => handleErrors({ status: 429, data: {} }, z)).toThrow(z.errors.ThrottledError)
    expect(() => handleErrors({ status: 422, content: "not json" }, z)).toThrow(z.errors.Error)
    const skipped = { status: 404, data: {}, skipThrowForStatus: true }
    expect(handleErrors(skipped, z)).toBe(skipped)
  })

  it("sends the key as a bearer token, trimmed", () => {
    expect(addApiKey({ url: "x" }, null, { authData: { api_key: " ak_test " } }).headers).toEqual({ Authorization: "Bearer ak_test", Accept: "application/json" })
  })
})

describe("Send Document From PDF body", () => {
  it("pairs names with emails, in order", () => {
    expect(pdfBody({ file: "https://x.test/a.pdf", signer_emails: ["a@example.com", "b@example.com"], signer_names: ["Ama"], title: "NDA", expires_in_days: "14" }).body).toEqual({
      file_url: "https://x.test/a.pdf",
      recipients: [{ email: "a@example.com", name: "Ama", role: "SIGNER" }, { email: "b@example.com", role: "SIGNER" }],
      title: "NDA",
      expires_in_days: 14,
    })
  })

  it("says what is missing in plain words", () => {
    expect(pdfBody({ file: "https://x.test/a.pdf", signer_emails: [] }).problem).toMatch(/at least one signer/)
    expect(pdfBody({ file: "https://x.test/a.pdf", signer_emails: ["a@example.com"], signer_names: ["A", "B"] }).problem).toMatch(/2 signer names but only 1/)
    expect(pdfBody({ signer_emails: "a@example.com" }).problem).toMatch(/Add the PDF/)
  })
})

describe("Find Document query", () => {
  it("needs a title or an email, and a known status", () => {
    expect(searchParams({ status: "completed" }).problem).toMatch(/title or the recipient email/)
    expect(searchParams({ title: "NDA", status: "signed" }).problem).toMatch(/not a status/)
    expect(searchParams({ title: " NDA ", status: "Completed" }).params).toEqual({ title: "NDA", status: "completed", limit: 1 })
  })
})

describe("templates", () => {
  const body = { data: [{ slug: "mutual-nda", title: "Mutual NDA template", roles: [], variables: [] }], saved: [{ id: "s1", name: "Our NDA", template: "mutual-nda" }] }

  it("reads a saved template's roles from the library template it came from", () => {
    expect(templateChoices(body).map((c) => c.id)).toEqual(["saved:s1", "library:mutual-nda"])
    expect(templateFor(parseChoice("saved:s1"), body).slug).toBe("mutual-nda")
    expect(parseChoice("nonsense")).toBeNull()
  })
})

describe("trigger samples", () => {
  /** Every key path in a value, so two payloads can be compared by shape. */
  const shape = (value, prefix = "") =>
    value && typeof value === "object" ? Object.entries(value).flatMap(([k, v]) => [`${prefix}${k}`, ...shape(v, `${prefix}${k}.`)]) : []
  const events = ["document.sent", "document.viewed", "document.signed", "document.completed", "document.declined", "document.expired"]

  it.each(events)("%s has the same shape and values as Salsox's own sample", (event) => {
    const ours = sampleEvent(event)
    const theirs = samplePayload(event, "https://salsox.com", new Date(ours.created_at))
    expect(shape(ours)).toEqual(shape(theirs))
    expect(ours).toEqual(theirs)
  })
})
