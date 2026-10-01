/**
 * Tests for deleting a folder of stored files (storage.ts), on both drivers.
 *
 * The folder sweep is what removes a deleted account's PDFs, so the tests
 * that matter are the ones about its reach: it must take everything under the
 * folder, across Vercel Blob's pages of results, and nothing outside it, and
 * it must refuse a user id that would name every user's folder at once.
 *
 * The local driver writes real files under .data/storage, in a folder named
 * for this test run, and removes them. Vercel Blob is mocked.
 */
import { existsSync, promises as fs } from "node:fs"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { afterEach, describe, expect, it, vi } from "vitest"

const list = vi.fn()
const del = vi.fn()
vi.mock("@vercel/blob", () => ({ list: (...a: unknown[]) => list(...a), del: (...a: unknown[]) => del(...a) }))

const { deleteFolder, documentKey, putFile, userFolder } = await import("./storage")

const token = process.env.BLOB_READ_WRITE_TOKEN
const local = (key: string) => path.join(process.cwd(), ".data", "storage", key)

afterEach(() => {
  vi.clearAllMocks()
  if (token === undefined) delete process.env.BLOB_READ_WRITE_TOKEN
  else process.env.BLOB_READ_WRITE_TOKEN = token
})

describe("userFolder", () => {
  it("names one user's folder", () => {
    expect(userFolder("user_1")).toBe("documents/user_1/")
  })

  it("refuses an id that could reach beyond it", () => {
    for (const id of ["", "a/b", "..", "a b"]) expect(() => userFolder(id)).toThrow()
  })
})

describe("deleteFolder on the local driver", () => {
  it("removes every file under the folder and nothing beside it", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    const gone = `test-${randomUUID()}`
    const kept = `test-${randomUUID()}`
    const goneKeys = [documentKey(gone, "d1", "original"), documentKey(gone, "d1", "sealed"), documentKey(gone, "d2", "original")]
    const keptKey = documentKey(kept, "d1", "original")
    for (const key of [...goneKeys, keptKey]) await putFile(key, new Uint8Array([1]))

    try {
      await deleteFolder(userFolder(gone))
      for (const key of goneKeys) expect(existsSync(local(key))).toBe(false)
      expect(existsSync(local(keptKey))).toBe(true)
    } finally {
      await fs.rm(local(userFolder(gone)), { recursive: true, force: true })
      await fs.rm(local(userFolder(kept)), { recursive: true, force: true })
    }
  })

  it("is not an error when the folder never existed", async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    await expect(deleteFolder(userFolder(`test-${randomUUID()}`))).resolves.toBeUndefined()
  })

  it("refuses a key that is not a folder", async () => {
    await expect(deleteFolder("documents/user_1")).rejects.toThrow()
  })
})

describe("deleteFolder on Vercel Blob", () => {
  it("deletes every page of results under the prefix", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test"
    list
      .mockResolvedValueOnce({ blobs: [{ pathname: "documents/u1/a/original.pdf" }], hasMore: true, cursor: "next" })
      .mockResolvedValueOnce({ blobs: [{ pathname: "documents/u1/b/original.pdf" }], hasMore: false })

    await deleteFolder("documents/u1/")

    expect(list).toHaveBeenNthCalledWith(1, { prefix: "documents/u1/", cursor: undefined })
    expect(list).toHaveBeenNthCalledWith(2, { prefix: "documents/u1/", cursor: "next" })
    expect(del).toHaveBeenCalledWith(["documents/u1/a/original.pdf"])
    expect(del).toHaveBeenCalledWith(["documents/u1/b/original.pdf"])
  })

  it("does not call delete for an empty folder", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "test"
    list.mockResolvedValueOnce({ blobs: [], hasMore: false })
    await deleteFolder("documents/u1/")
    expect(del).not.toHaveBeenCalled()
  })
})
