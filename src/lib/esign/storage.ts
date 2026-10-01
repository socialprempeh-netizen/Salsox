/**
 * File storage for documents (original and sealed PDFs).
 *
 * Production uses Vercel Blob in PRIVATE mode: files are never reachable by
 * URL, only through the app's own routes, which check ownership or a signing
 * token first. Without `BLOB_READ_WRITE_TOKEN` (local development, tests) it
 * falls back to the local filesystem under `.data/storage`, so the whole
 * signing flow runs with nothing but a database.
 *
 * Keys are opaque strings stored on the Document row; callers never build
 * paths themselves.
 */
import { promises as fs } from "node:fs"
import path from "node:path"
import { createHash } from "node:crypto"

const LOCAL_ROOT = path.join(process.cwd(), ".data", "storage")

function blobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN)
}

/** Rejects keys that could escape the storage root on the filesystem driver. */
function safeLocalPath(key: string): string {
  if (!/^[\w\-/.]+$/.test(key) || key.includes("..")) throw new Error(`Invalid storage key: ${key}`)
  return path.join(LOCAL_ROOT, key)
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

export async function putFile(key: string, bytes: Uint8Array, contentType = "application/pdf"): Promise<string> {
  if (blobConfigured()) {
    const { put } = await import("@vercel/blob")
    // addRandomSuffix off: the key is already unique (it embeds the document
    // id), and the stored key must be exactly what we read back later.
    await put(key, Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true })
    return key
  }
  const file = safeLocalPath(key)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, bytes)
  return key
}

export async function getFile(key: string): Promise<Uint8Array> {
  if (blobConfigured()) {
    const { get } = await import("@vercel/blob")
    const result = await get(key, { access: "private", useCache: false })
    if (!result?.stream) throw new Error(`Stored file not found: ${key}`)
    return new Uint8Array(await new Response(result.stream).arrayBuffer())
  }
  return new Uint8Array(await fs.readFile(safeLocalPath(key)))
}

export async function deleteFile(key: string): Promise<void> {
  if (blobConfigured()) {
    const { del } = await import("@vercel/blob")
    await del(key)
    return
  }
  await fs.rm(safeLocalPath(key), { force: true })
}

/**
 * Deletes every file whose key starts with `prefix`, which must name a folder
 * (end in "/"). Used when an account goes: whatever was stored for it, rows or
 * no rows, goes too.
 */
export async function deleteFolder(prefix: string): Promise<void> {
  if (!prefix.endsWith("/")) throw new Error(`Not a folder: ${prefix}`)
  if (blobConfigured()) {
    const { list, del } = await import("@vercel/blob")
    let cursor: string | undefined
    do {
      const page = await list({ prefix, cursor })
      if (page.blobs.length > 0) await del(page.blobs.map((b) => b.pathname))
      cursor = page.hasMore ? page.cursor : undefined
    } while (cursor)
    return
  }
  await fs.rm(safeLocalPath(prefix), { recursive: true, force: true })
}

export function documentKey(userId: string, documentId: string, name: "original" | "sealed"): string {
  return `documents/${userId}/${documentId}/${name}.pdf`
}

/**
 * Where a sealed copy is stored: named by its own SHA-256, beside the
 * original. It used to be the fixed `sealed.pdf` from `documentKey`, so two
 * finalizations running at once wrote to the same key, and the file that
 * survived could be the other run's while the recorded fingerprint was this
 * one's. Different bytes now always land at different keys, and the key a
 * document records is the file whose hash it records.
 */
export function sealedDocumentKey(userId: string, documentId: string, sha256: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error("A sealed key needs a hex SHA-256")
  return `documents/${userId}/${documentId}/sealed-${sha256.slice(0, 32)}.pdf`
}

/** The folder every document of one user is stored under (see `documentKey`). */
export function userFolder(userId: string): string {
  // An empty id would name `documents/`, every user's files at once.
  if (!/^[\w-]+$/.test(userId)) throw new Error(`Invalid user id: ${userId}`)
  return `documents/${userId}/`
}
