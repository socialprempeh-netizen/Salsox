/**
 * Tests for GET /api/v1/documents/{id}/pdf: a key is required, the lookup is
 * scoped to the key's account, the signed PDF is served once sealed and
 * labelled as such, and a signed PDF that does not exist yet is a coded 409.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const authenticate = vi.fn()
const findFirst = vi.fn()
const getFile = vi.fn()

vi.mock("@/lib/api-keys-store", () => ({ authenticateApiRequest: (...a: unknown[]) => authenticate(...a) }))
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => true }))
vi.mock("@/lib/prisma", () => ({ prisma: { document: { findFirst: (...a: unknown[]) => findFirst(...a) } } }))
vi.mock("@/lib/esign/storage", () => ({ getFile: (...a: unknown[]) => getFile(...a) }))

const { GET } = await import("./route")

const call = (query = "", auth = true) =>
  GET(new Request(`https://app.example.com/api/v1/documents/d1/pdf${query}`, { headers: auth ? { authorization: "Bearer ak_x" } : {} }), { params: Promise.resolve({ id: "d1" }) })

beforeEach(() => {
  vi.clearAllMocks()
  authenticate.mockResolvedValue({ userId: "u1", keyId: "k1" })
  getFile.mockResolvedValue(new Uint8Array([37, 80, 68, 70]))
})

describe("GET /api/v1/documents/{id}/pdf", () => {
  it("needs a key", async () => {
    authenticate.mockResolvedValue(null)
    const res = await call("", false)
    expect(res.status).toBe(401)
    expect(findFirst).not.toHaveBeenCalled()
  })

  it("looks only in the key's account, and another account's document is a 404", async () => {
    findFirst.mockResolvedValue(null)
    const res = await call()
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "d1", userId: "u1" })
    expect(res.status).toBe(404)
    expect((await res.json()).error.code).toBe("not_found")
    expect(getFile).not.toHaveBeenCalled()
  })

  it("serves the signed PDF once sealed", async () => {
    findFirst.mockResolvedValue({ title: "Lease", originalKey: "o.pdf", sealedKey: "s.pdf" })
    const res = await call()
    expect(res.status).toBe(200)
    expect(getFile).toHaveBeenCalledWith("s.pdf")
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("x-document-version")).toBe("signed")
    expect(res.headers.get("content-disposition")).toContain("Lease (signed).pdf")
    expect(res.headers.get("cache-control")).toBe("private, no-store")
  })

  it("serves the original before sealing, and refuses ?version=signed then", async () => {
    findFirst.mockResolvedValue({ title: "Lease", originalKey: "o.pdf", sealedKey: null })
    const plain = await call()
    expect(plain.headers.get("x-document-version")).toBe("original")
    expect(getFile).toHaveBeenCalledWith("o.pdf")

    const signed = await call("?version=signed")
    expect(signed.status).toBe(409)
    expect((await signed.json()).error.code).toBe("not_signed")
  })
})
