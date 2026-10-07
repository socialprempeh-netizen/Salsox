/**
 * The deployment's mark (NEXT_PUBLIC_BRAND_MARK, src/config/brand.ts) as
 * something an image renderer can embed: the generated favicon and
 * home-screen icon (src/app/icon.tsx, src/app/apple-icon.tsx) are drawn by
 * Satori, which cannot fetch a relative path, so a file under public/ is read
 * and inlined as a data URL. An absolute URL is passed through unchanged.
 *
 * Server only (it reads the file system).
 */
import fs from "node:fs"
import path from "node:path"

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml" }

/**
 * Where a mark setting points. `url` for an absolute http(s) address; `file`
 * for a path under public/, normalised and refused if it would climb out of
 * it ("/../.env"); null when unset or unusable.
 */
export function markSource(mark: string | null | undefined): { url: string } | { file: string } | null {
  const value = mark?.trim()
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return { url: value }
  const relative = path.posix.normalize(value.replace(/^\/+/, ""))
  if (relative.startsWith("..") || path.posix.isAbsolute(relative) || !TYPES[path.posix.extname(relative).toLowerCase()]) return null
  return { file: relative }
}

/** The mark as an embeddable src, or null when unset, unusable or missing. */
export function markImageSrc(mark: string | null | undefined): string | null {
  const source = markSource(mark)
  if (!source) return null
  if ("url" in source) return source.url
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), "public", source.file))
    return `data:${TYPES[path.posix.extname(source.file).toLowerCase()]};base64,${bytes.toString("base64")}`
  } catch {
    return null
  }
}
