/**
 * Salsox Signing: the extension's rules as pure functions, with no browser or
 * extension APIs, so the popup, the background worker and the tests
 * (src/lib/signing-extension.test.ts) share them.
 *
 * - Fields are placed in page percentages, the unit the signing engine and
 *   POST /api/v1/documents use (x, y from the page's top left; width,
 *   height), and kept on the page.
 * - A draft becomes the API's request body, one recipient per signer, each
 *   field pointing at its signer by position.
 * - The plan the API reports (GET /api/v1/me) decides when to offer an
 *   upgrade instead of a send the server would refuse; a refusal that still
 *   comes back (402) maps to the same prompts. The server is the authority
 *   on both; this only tells the person first.
 */

/** Field types the extension places, as the API names them. */
export const FIELD_TYPES = ["SIGNATURE", "DATE", "TEXT"]

/** A new field's size, in page percent. */
export const FIELD_SIZE = {
  SIGNATURE: { width: 30, height: 6 },
  DATE: { width: 18, height: 4.5 },
  TEXT: { width: 26, height: 4.5 },
}

/** The most signers a document from the extension can have. */
export const MAX_SIGNERS = 5

/** The PDF size limit, as the signing engine applies it (4 MB). */
export const MAX_PDF_BYTES = 4 * 1024 * 1024

/** One colour per signer, in order, so each person's fields read at a glance. */
export const SIGNER_COLORS = ["#0e6b63", "#7a3e9d", "#a35a00", "#2b5fb3", "#b4235a"]

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const round = (n) => Math.round(n * 100) / 100
const clamp = (n, min, max) => Math.min(Math.max(n, min), max)

/** A field of `type` for signer `signer`, centred where the page was clicked, kept on the page. */
export function placeField({ id, type, signer, page, x, y }) {
  const size = FIELD_SIZE[type]
  if (!size) throw new Error(`unknown field type ${type}`)
  return {
    id,
    type,
    signer,
    page,
    x: round(clamp(x - size.width / 2, 0, 100 - size.width)),
    y: round(clamp(y - size.height / 2, 0, 100 - size.height)),
    width: size.width,
    height: size.height,
    label: "",
  }
}

/** The field moved so its top left is at (x, y), kept on the page. */
export function moveField(field, x, y) {
  return { ...field, x: round(clamp(x, 0, 100 - field.width)), y: round(clamp(y, 0, 100 - field.height)) }
}

/** The fields with signer `index` removed, and later signers moved down one. */
export function removeSigner(fields, index) {
  return fields.filter((f) => f.signer !== index).map((f) => (f.signer > index ? { ...f, signer: f.signer - 1 } : f))
}

/** The PDF's title from its file name, as the dashboard names an upload. */
export function titleFromFileName(name) {
  return String(name ?? "").replace(/\.pdf$/i, "").trim().slice(0, 140) || "Untitled document"
}

/**
 * What stops a draft from being sent, as short codes the popup words:
 * `noFields`, `signerNoField:<i>`, `email:<i>`, `duplicate:<i>`, `title`.
 * Empty when it can go. Mirrors the engine's own checks (every signer needs
 * a field, every recipient a valid, distinct address) so they are caught
 * before the round trip.
 */
export function draftProblems(draft) {
  const problems = []
  if (!draft.title || !draft.title.trim()) problems.push("title")
  if (!draft.fields.length) problems.push("noFields")
  const seen = new Set()
  draft.signers.forEach((s, i) => {
    if (!draft.fields.some((f) => f.signer === i)) problems.push(`signerNoField:${i}`)
    const email = String(s.email ?? "").trim().toLowerCase()
    if (!EMAIL.test(email)) problems.push(`email:${i}`)
    else if (seen.has(email)) problems.push(`duplicate:${i}`)
    seen.add(email)
  })
  return problems
}

/** The JSON for POST /api/v1/documents (sent beside the PDF as the `data` part). */
export function toApiRequest(draft) {
  const sequential = draft.signingOrder === "SEQUENTIAL" && draft.signers.length > 1
  return {
    title: draft.title.trim().slice(0, 140),
    ...(draft.message && draft.message.trim() ? { message: draft.message.trim().slice(0, 2000) } : {}),
    signing_order: sequential ? "sequential" : "parallel",
    recipients: draft.signers.map((s, i) => ({ email: s.email.trim().toLowerCase(), ...(s.name && s.name.trim() ? { name: s.name.trim().slice(0, 120) } : {}), order: i })),
    fields: draft.fields.map((f) => ({
      recipient: f.signer,
      type: f.type,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width,
      height: f.height,
      ...(f.type === "TEXT" && f.label && f.label.trim() ? { label: f.label.trim().slice(0, 80) } : {}),
    })),
  }
}

/**
 * Why to offer an upgrade before sending, or null: `limit` (no free
 * documents left this month), `sequential` (signing in order on a plan
 * without it). `plan` is GET /api/v1/me's `plan`.
 */
export function upgradeBeforeSend(plan, draft) {
  if (!plan) return null
  if (plan.documents_left === 0) return "limit"
  if (draft.signingOrder === "SEQUENTIAL" && draft.signers.length > 1 && !plan.features?.sequential_signing) return "sequential"
  return null
}

/** The upgrade prompt for a plan refusal from the server (402, `plan_*`), or null for any other error. */
export function upgradeFromError(code) {
  if (code === "plan_unlimitedDocuments") return "limit"
  if (code === "plan_sequentialSigning") return "sequential"
  if (code === "plan_signAndPay") return "payment"
  if (typeof code === "string" && code.startsWith("plan_")) return "plan"
  return null
}

/** The plan line under the account: "Free plan: 2 of 3 documents left this month". */
export function allowanceText(plan) {
  if (!plan) return ""
  const name = { free: "Free", personal: "Personal", business: "Business" }[plan.tier] ?? "Your"
  if (plan.documents_left === null || plan.documents_left === undefined) return `${name} plan: unlimited documents`
  const n = plan.documents_left
  return `${name} plan: ${n} of ${plan.documents_per_month} free documents left this month`
}
