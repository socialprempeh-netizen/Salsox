/**
 * Helpers for serving document files.
 */

/**
 * A Content-Disposition header that survives any title: an ASCII fallback
 * (quotes and non-ASCII stripped) plus the RFC 5987 UTF-8 form, which modern
 * browsers prefer. Titles are user input, so this also stops header injection.
 */
export function contentDisposition(filename: string, disposition: "attachment" | "inline" = "attachment"): string {
  const clean = filename.replace(/[\r\n"\\/]/g, "").trim() || "document.pdf"
  const ascii = clean.replace(/[^\x20-\x7E]/g, "_")
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`
}

/** A filesystem-safe name for entries inside the export ZIP. */
export function safeFileName(name: string, fallback = "document"): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  return cleaned || fallback
}
