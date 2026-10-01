/**
 * Signing-engine settings that more than one layer has to agree on, each
 * defined once.
 *
 * Both used to be written out wherever they were needed: the 4 MB cap in the
 * server check and again in the upload dropzone (with a comment asking to keep
 * them in sync), and the 30-day default in two engine modules plus the schema,
 * the Quick Send action and its form. A copy that drifts fails quietly: a
 * dropzone that accepts a file the server refuses, or a renewal that grants a
 * different term than a new document gets.
 *
 * No imports, on purpose: client components read this too, and pulling in
 * pdf-lib or Prisma here would ship them to the browser.
 */

/**
 * Largest PDF accepted, in bytes. 4 MB stays under Vercel's 4.5 MB request
 * body limit for functions, which an upload through a server action is
 * subject to. Larger files need a direct browser-to-Blob upload.
 */
export const MAX_PDF_BYTES = 4 * 1024 * 1024

/** The same cap in megabytes, for the messages that state it. */
export const MAX_PDF_MB = MAX_PDF_BYTES / (1024 * 1024)

/**
 * Server-action body limit for next.config.ts: the PDF cap plus room for the
 * multipart envelope and the other form fields, still under Vercel's 4.5 MB.
 */
export const SERVER_ACTION_BODY_LIMIT = `${MAX_PDF_MB + 0.4}mb` as const

/**
 * Why a chosen file cannot be uploaded, or null when it can: not a PDF, or
 * over the cap. The browser checks this before the file is put into the form,
 * whether it was picked or dropped; the server checks the bytes again in
 * `inspectPdf`, because a browser check proves nothing.
 */
export function pdfFileProblem(file: { name: string; type: string; size: number }): "notPdf" | "tooLarge" | null {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return "notPdf"
  if (file.size > MAX_PDF_BYTES) return "tooLarge"
  return null
}

/**
 * How long signing links stay valid when nobody chose otherwise: the default
 * on a new document and in Quick Send, and the term a renewal grants to a
 * document created without an explicit expiry.
 */
export const DEFAULT_EXPIRY_DAYS = 30

/** Longest expiry a sender can choose. */
export const MAX_EXPIRY_DAYS = 365

/**
 * Reads an expiry choice from a form: "never" is no expiry (null), a number
 * is clamped to 1..MAX_EXPIRY_DAYS, and anything missing or unreadable falls
 * back to the default.
 */
export function parseExpiryChoice(raw: string | null | undefined): number | null {
  if (raw === "never") return null
  const days = Number.parseInt(raw ?? "", 10)
  if (!Number.isFinite(days)) return DEFAULT_EXPIRY_DAYS
  return Math.min(MAX_EXPIRY_DAYS, Math.max(1, days))
}
