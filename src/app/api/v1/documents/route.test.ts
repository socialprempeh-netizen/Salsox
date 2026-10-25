/**
 * Tests for the public documents API (/api/v1/documents and
 * /api/v1/documents/{id}): a key is required, the send goes to the engine
 * with the caller's account, template roles are checked before anything is
 * made, the engine's refusals come back as coded JSON errors, and the list
 * passes its filters through.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authenticate = vi.fn()
const sendFromApi = vi.fn()
const getApiDocument = vi.fn()
const listApiDocuments = vi.fn()
const findLibraryTemplate = vi.fn()
const fetchPdf = vi.fn()

vi.mock("@/lib/api-keys-store", () => ({ authenticateApiRequest: (...a: unknown[]) => authenticate(...a) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }))
vi.mock("@/lib/esign/api-send", () => ({ sendFromApi: (...a: unknown[]) => sendFromApi(...a) }))
vi.mock("@/lib/esign/templates", () => ({ getSavedTemplate: async () => null }))
vi.mock("@/lib/api/documents-store", () => ({
  getApiDocument: (...a: unknown[]) => getApiDocument(...a),
  listApiDocuments: (...a: unknown[]) => listApiDocuments(...a),
}))
vi.mock("@/lib/api/fetch-file", () => ({ fetchPdf: (...a: unknown[]) => fetchPdf(...a) }))
vi.mock("@/lib/seo-agent/published-pages", () => ({ findLibraryTemplate: (...a: unknown[]) => findLibraryTemplate(...a) }))
vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((key: string) => `msg:${key}`, { has: (key: string) => key !== "unknownCode" }),
}))

const { GET, POST } = await import("./route")
const { GET: GET_ONE } = await import("./[id]/route")

const post = (body: unknown) =>
  new Request("https://app.example.com/api/v1/documents", { method: "POST", headers: { authorization: "Bearer ak_x", "content-type": "application/json" }, body: JSON.stringify(body) })
const get = (query = "") => new Request(`https://app.example.com/api/v1/documents${query}`, { headers: { authorization: "Bearer ak_x" } })

const doc = { id: "d1", title: "Lease", status: "PENDING", recipients: [] }

beforeEach(() => {
  vi.resetAllMocks()
  authenticate.mockResolvedValue({ keyId: "k1", userId: "u1", email: "owner@example.com", name: "Owner" })
  getApiDocument.mockResolvedValue(doc)
})

describe("POST /api/v1/documents", () => {
  it("answers 401 without a valid key", async () => {
    authenticate.mockResolvedValue(null)
    const res = await POST(post({}))
    expect(res.status).toBe(401)
  })

  it("downloads file_url and sends it for the key's account", async () => {
    fetchPdf.mockResolvedValue({ ok: true, bytes: new Uint8Array([37, 80]) })
    sendFromApi.mockResolvedValue({ ok: true, documentId: "d1", undelivered: 0, notEmailed: 1 })
    const res = await POST(post({ title: "Lease", file_url: "https://files.example.com/a.pdf", recipients: [{ email: "a@example.com" }] }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ...doc, undelivered: 0, not_emailed: 1 })
    expect(fetchPdf).toHaveBeenCalledWith("https://files.example.com/a.pdf")
    expect(sendFromApi).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", title: "Lease", sender: { name: "Owner", email: "owner@example.com" }, source: expect.objectContaining({ kind: "pdf", fields: null }) }))
  })

  it("refuses a file_url it may not fetch", async () => {
    fetchPdf.mockResolvedValue({ ok: false, error: "url", detail: "private" })
    const res = await POST(post({ file_url: "https://10.0.0.1/a.pdf", recipients: [{ email: "a@example.com" }] }))
    expect(res.status).toBe(422)
    expect((await res.json()).error.code).toBe("file_url")
    expect(sendFromApi).not.toHaveBeenCalled()
  })

  it("checks a template's roles before making anything", async () => {
    findLibraryTemplate.mockResolvedValue({ template: { h1: "Lease agreement", roles: [{ id: "landlord", label: "Landlord", you: true }, { id: "tenant", label: "Tenant", you: false }] } })
    const bad = await POST(post({ template: "lease", recipients: [{ email: "a@example.com", template_role: "buyer" }] }))
    expect(bad.status).toBe(422)
    expect((await bad.json()).error.code).toBe("template_roles")
    expect(sendFromApi).not.toHaveBeenCalled()

    sendFromApi.mockResolvedValue({ ok: true, documentId: "d1", undelivered: 0, notEmailed: 0 })
    const ok = await POST(post({ template: "lease", values: { Rent: 500 }, recipients: [{ email: "t@example.com" }] }))
    expect(ok.status).toBe(201)
    const args = sendFromApi.mock.calls[0][0]
    expect(args.title).toBe("Lease agreement")
    expect(args.source.values).toEqual({ Rent: "500" })
    expect(args.source.byRole.get("tenant").email).toBe("t@example.com")
  })

  it("answers 404 for an unknown template", async () => {
    findLibraryTemplate.mockResolvedValue(undefined)
    const res = await POST(post({ template: "nope", recipients: [{ email: "a@example.com" }] }))
    expect(res.status).toBe(404)
  })

  it("passes the engine's refusal on with its code and the dashboard's message", async () => {
    fetchPdf.mockResolvedValue({ ok: true, bytes: new Uint8Array([1]) })
    sendFromApi.mockResolvedValue({ ok: false, error: "plan_sequentialSigning" })
    const res = await POST(post({ file_url: "https://x.example/a.pdf", signing_order: "sequential", recipients: [{ email: "a@example.com" }] }))
    expect(res.status).toBe(402)
    expect((await res.json()).error).toEqual({ code: "plan_sequentialSigning", message: "msg:plan_sequentialSigning" })
  })

  it("explains fields_required", async () => {
    fetchPdf.mockResolvedValue({ ok: true, bytes: new Uint8Array([1]) })
    sendFromApi.mockResolvedValue({ ok: false, error: "fieldsRequired" })
    const res = await POST(post({ file_url: "https://x.example/a.pdf", recipients: [{ email: "a@example.com", role: "cc" }] }))
    expect((await res.json()).error.code).toBe("fields_required")
  })

  it("takes a multipart upload with the JSON as `data`", async () => {
    sendFromApi.mockResolvedValue({ ok: true, documentId: "d1", undelivered: 0, notEmailed: 0 })
    const form = new FormData()
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "Offer letter.pdf", { type: "application/pdf" }))
    form.set("data", JSON.stringify({ recipients: [{ email: "a@example.com" }] }))
    const res = await POST(new Request("https://app.example.com/api/v1/documents", { method: "POST", headers: { authorization: "Bearer ak_x" }, body: form }))
    expect(res.status).toBe(201)
    const args = sendFromApi.mock.calls[0][0]
    expect(args.title).toBe("Offer letter")
    expect(Array.from(args.source.bytes)).toEqual([37, 80, 68, 70])
  })
})

describe("GET /api/v1/documents", () => {
  it("passes the filters and answers with the next cursor", async () => {
    listApiDocuments.mockResolvedValue({ data: [doc], nextCursor: "d1" })
    const res = await GET(get("?status=completed&recipient=a@example.com&limit=1"))
    expect(await res.json()).toEqual({ data: [doc], next_cursor: "d1" })
    expect(listApiDocuments).toHaveBeenCalledWith("u1", expect.objectContaining({ statuses: ["COMPLETED"], recipient: "a@example.com", limit: 1 }))
  })

  it("refuses a bad filter", async () => {
    const res = await GET(get("?status=signed"))
    expect(res.status).toBe(422)
  })

  it("answers 404 for a document of another account", async () => {
    getApiDocument.mockResolvedValue(null)
    const res = await GET_ONE(get("/x"), { params: Promise.resolve({ id: "x" }) })
    expect(res.status).toBe(404)
    expect(getApiDocument).toHaveBeenCalledWith("u1", "x")
  })
})
