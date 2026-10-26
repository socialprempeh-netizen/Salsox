/**
 * Tests for reading the public documents API's input (src/lib/api/documents.ts):
 * exactly one source, the forgiving shapes integration platforms send,
 * fields pointing at real recipients, template roles filled in order, and the
 * list query's filters.
 */
import { describe, expect, it } from "vitest"
import { assignTemplateRoles, engineErrorStatus, parseListQuery, parseSendInput, pickPdfVersion, type ApiRecipient } from "./documents"

const one = [{ email: "Ama@Example.com", name: "Ama" }]

describe("parseSendInput", () => {
  it("reads a minimal file_url request with defaults", () => {
    const r = parseSendInput({ file_url: "https://files.example.com/a.pdf", recipients: one })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input.source).toEqual({ kind: "url", url: "https://files.example.com/a.pdf" })
    expect(r.input.recipients).toEqual([{ email: "ama@example.com", name: "Ama", role: "SIGNER", order: 0, templateRole: undefined }])
    expect(r.input).toMatchObject({ signingOrder: "PARALLEL", expiresInDays: 30, fields: null })
  })

  it("asks for exactly one source", () => {
    const none = parseSendInput({ recipients: one })
    expect(!none.ok && none.problem.code).toBe("source")
    const two = parseSendInput({ file_url: "https://x.example/a.pdf", template: "nda", recipients: one })
    expect(!two.ok && two.problem.code).toBe("source")
    const upload = parseSendInput({ recipients: one }, { hasUpload: true })
    expect(upload.ok && upload.input.source.kind).toBe("upload")
  })

  it("accepts strings and any case where platforms send them", () => {
    const r = parseSendInput({
      file_base64: "JVBERi0=",
      signing_order: "sequential",
      expires_in_days: "never",
      recipients: [{ email: "a@example.com", role: "approver", order: "2" }, { email: "b@example.com" }],
      fields: [{ recipient: "1", type: "signature", page: "1", x: "10", y: "80", width: "30", height: "6", required: "false" }],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.input.signingOrder).toBe("SEQUENTIAL")
    expect(r.input.expiresInDays).toBeNull()
    expect(r.input.recipients.map((x) => [x.role, x.order])).toEqual([["APPROVER", 2], ["SIGNER", 1]])
    expect(r.input.fields).toEqual([{ recipientIndex: 1, type: "SIGNATURE", page: 1, x: 10, y: 80, width: 30, height: 6, required: false, label: undefined }])
  })

  it("matches a field to a recipient by email", () => {
    const r = parseSendInput({ file_url: "https://x.example/a.pdf", recipients: one, fields: [{ recipient: "AMA@example.com", type: "DATE", page: 1, x: 1, y: 1, width: 10, height: 5 }] })
    expect(r.ok && r.input.fields?.[0].recipientIndex).toBe(0)
  })

  it("refuses a field for nobody, or off the page", () => {
    const nobody = parseSendInput({ file_url: "https://x.example/a.pdf", recipients: one, fields: [{ recipient: "kofi@example.com", type: "DATE", page: 1, x: 1, y: 1, width: 10, height: 5 }] })
    expect(!nobody.ok && nobody.problem.message).toContain("fields.0.recipient")
    const off = parseSendInput({ file_url: "https://x.example/a.pdf", recipients: one, fields: [{ recipient: 0, type: "DATE", page: 1, x: 95, y: 1, width: 10, height: 5 }] })
    expect(!off.ok && off.problem.code).toBe("invalid_input")
  })

  it("refuses fields with a template, which places its own", () => {
    const r = parseSendInput({ template: "nda", recipients: one, fields: [{ recipient: 0, type: "DATE", page: 1, x: 1, y: 1, width: 10, height: 5 }] })
    expect(!r.ok && r.problem.code).toBe("fields_with_template")
  })

  it("points at the input that is wrong", () => {
    const r = parseSendInput({ file_url: "https://x.example/a.pdf", recipients: [{ email: "not an email" }] })
    expect(!r.ok && r.problem.message).toContain("recipients.0.email")
  })
})

describe("assignTemplateRoles", () => {
  const roles = [
    { id: "landlord", label: "Landlord", you: true },
    { id: "tenant", label: "Tenant", you: false },
    { id: "guarantor", label: "Guarantor", you: false },
  ]
  const r = (email: string, templateRole?: string): ApiRecipient => ({ email, role: "SIGNER", order: 0, templateRole })

  it("fills the open roles in order when none are named", () => {
    const out = assignTemplateRoles(roles, [r("t@example.com"), r("g@example.com")])
    expect(out.ok && [...out.byRole.entries()].map(([k, v]) => [k, v.email])).toEqual([["tenant", "t@example.com"], ["guarantor", "g@example.com"]])
  })

  it("lets a recipient name their role", () => {
    const out = assignTemplateRoles(roles, [r("g@example.com", "guarantor"), r("t@example.com")])
    expect(out.ok && out.byRole.get("tenant")?.email).toBe("t@example.com")
  })

  it("refuses the sender's role, an unknown role, a missing one or one too many", () => {
    expect(assignTemplateRoles(roles, [r("a@example.com", "landlord"), r("b@example.com")]).ok).toBe(false)
    expect(assignTemplateRoles(roles, [r("a@example.com", "buyer"), r("b@example.com")]).ok).toBe(false)
    expect(assignTemplateRoles(roles, [r("a@example.com")]).ok).toBe(false)
    expect(assignTemplateRoles(roles, [r("a@example.com"), r("b@example.com"), r("c@example.com")]).ok).toBe(false)
  })
})

describe("parseListQuery", () => {
  const q = (s: string) => parseListQuery(new URLSearchParams(s))

  it("defaults to the newest 25 of everything", () => {
    expect(q("")).toEqual({ ok: true, query: { statuses: null, recipient: null, title: null, createdAfter: null, createdBefore: null, limit: 25, cursor: null } })
  })

  it("reads statuses as people say them", () => {
    const r = q("status=sent,Declined,completed")
    expect(r.ok && r.query.statuses).toEqual(["PENDING", "REJECTED", "COMPLETED"])
    expect(q("status=signed").ok).toBe(false)
  })

  it("reads the recipient, dates and limit, and refuses bad ones", () => {
    const r = q("recipient=Ama@Example.com&created_after=2026-10-01&limit=100")
    expect(r.ok && r.query).toMatchObject({ recipient: "ama@example.com", createdAfter: new Date("2026-10-01"), limit: 100 })
    expect(q("created_before=yesterday").ok).toBe(false)
    expect(q("limit=101").ok).toBe(false)
    expect(q("limit=0").ok).toBe(false)
  })
})

describe("engineErrorStatus", () => {
  it("tells a plan limit, a refusal and a bad request apart", () => {
    expect(engineErrorStatus("plan_sequentialSigning")).toBe(402)
    expect(engineErrorStatus("emailNotConfirmed")).toBe(403)
    expect(engineErrorStatus("templateNotFound")).toBe(404)
    expect(engineErrorStatus("rateLimited")).toBe(429)
    expect(engineErrorStatus("signerWithoutFields")).toBe(422)
  })
})

describe("pickPdfVersion", () => {
  const draft = { originalKey: "u/d/original.pdf", sealedKey: null }
  const sealed = { originalKey: "u/d/original.pdf", sealedKey: "u/d/sealed-abc.pdf" }

  it("serves the signed PDF once sealed, the original until then", () => {
    expect(pickPdfVersion(null, sealed)).toEqual({ ok: true, version: "signed", key: "u/d/sealed-abc.pdf" })
    expect(pickPdfVersion(null, draft)).toEqual({ ok: true, version: "original", key: "u/d/original.pdf" })
  })

  it("serves the original on request, even when sealed", () => {
    expect(pickPdfVersion("Original", sealed)).toEqual({ ok: true, version: "original", key: "u/d/original.pdf" })
  })

  it("refuses a signed PDF that does not exist yet instead of sending the original", () => {
    expect(pickPdfVersion("signed", draft)).toMatchObject({ ok: false, status: 409, problem: { code: "not_signed" } })
  })

  it("refuses an unknown version", () => {
    expect(pickPdfVersion("final", sealed)).toMatchObject({ ok: false, status: 400, problem: { code: "invalid_input" } })
  })
})
