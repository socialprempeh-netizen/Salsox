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

export function documentKey(userId: string, documentId: string, name: "original" | "sealed"): string {
  return `documents/${userId}/${documentId}/${name}.pdf`
}
