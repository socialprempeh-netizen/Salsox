/**
 * The public documents API (/api/v1/documents), the part that can be stated
 * as functions: reading what an integration sends, and nothing else. The
 * routes call these, then hand the result to the signing engine
 * (src/lib/esign/api-send.ts), which is the authority on what may be sent.
 *
 * Shapes are snake_case and forgiving in the ways integration platforms need:
 * Zapier and Make send numbers as strings and enums in any case, so those are
 * accepted; anything that would change what is signed is not guessed at.
 *
 *   POST body (JSON, or multipart with a `file` part and the JSON as `data`):
 *     title, message, expires_in_days (1-365 or null/"never"), signing_order,
 *     one source:  file_url | file_base64 | (multipart file)
 *                  | template (a library slug) | saved_template_id, + values
 *     recipients:  [{ email, name, role, order, template_role }]
 *     fields:      [{ recipient (index or email), type, page, x, y, width, height, required, label }]
 *
 *   GET query: status (comma list), recipient (email), title, created_after,
 *     created_before, limit (1-100), cursor
 *
 * Described for developers in docs/webhooks.md and the Help Center reference.
 */
import { z } from "zod"
import type { DocumentStatus } from "@prisma/client"
import { MAX_EXPIRY_DAYS, MAX_RECIPIENTS, TITLE_MAX } from "@/lib/esign/schemas"
import { DEFAULT_EXPIRY_DAYS } from "@/lib/esign/limits"

/** What a parse refuses with: a code for the integration, a sentence for the person. */
export type ApiProblem = { code: string; message: string }

const lower = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v)
const upper = (v: unknown) => (typeof v === "string" ? v.trim().toUpperCase() : v)
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v)
/** "3" → 3, as form-style platforms send numbers. */
const num = (v: unknown) => (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) ? Number(v) : v)
const bool = (v: unknown) => (v === "true" ? true : v === "false" ? false : v)

const recipientSchema = z.object({
  email: z.preprocess(lower, z.email()),
  name: z.preprocess(blankToUndefined, z.string().trim().min(1).max(120).optional()),
  role: z.preprocess(upper, z.enum(["SIGNER", "APPROVER", "VIEWER", "CC"])).default("SIGNER"),
  order: z.preprocess(num, z.number().int().min(0).max(100)).optional(),
  /** For a template: which of its roles this person takes (its `id`). */
  template_role: z.preprocess(lower, z.string().max(40).optional()),
})

const fieldSchema = z.object({
  /** The recipient it belongs to: their position in `recipients` (from 0), or their email. */
  recipient: z.union([z.number().int().min(0), z.string().trim().min(1)]),
  type: z.preprocess(upper, z.enum(["SIGNATURE", "INITIALS", "NAME", "EMAIL", "DATE", "TEXT", "CHECKBOX"])),
  page: z.preprocess(num, z.number().int().min(1)),
  x: z.preprocess(num, z.number().min(0).max(100)),
  y: z.preprocess(num, z.number().min(0).max(100)),
  width: z.preprocess(num, z.number().min(1).max(100)),
  height: z.preprocess(num, z.number().min(1).max(100)),
  required: z.preprocess(bool, z.boolean()).default(true),
  label: z.string().max(80).optional(),
})

const sendSchema = z.object({
  title: z.preprocess(blankToUndefined, z.string().trim().min(1).max(TITLE_MAX).optional()),
  message: z.preprocess(blankToUndefined, z.string().trim().max(2000).optional()),
  expires_in_days: z
    .preprocess((v) => (v === "never" ? null : num(v)), z.number().int().min(1).max(MAX_EXPIRY_DAYS).nullable())
    .default(DEFAULT_EXPIRY_DAYS),
  signing_order: z.preprocess(upper, z.enum(["PARALLEL", "SEQUENTIAL"])).default("PARALLEL"),
  file_url: z.preprocess(blankToUndefined, z.string().max(2048).optional()),
  file_base64: z.preprocess(blankToUndefined, z.string().optional()),
  template: z.preprocess(lower, z.string().max(80).optional()),
  saved_template_id: z.preprocess(blankToUndefined, z.string().max(64).optional()),
  values: z.record(z.string().max(80), z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string().max(2000))).default({}),
  recipients: z.array(recipientSchema).min(1).max(MAX_RECIPIENTS),
  fields: z.array(fieldSchema).max(500).optional(),
})

export type ApiRecipient = { email: string; name?: string; role: "SIGNER" | "APPROVER" | "VIEWER" | "CC"; order: number; templateRole?: string }
export type ApiField = { recipientIndex: number; type: z.infer<typeof fieldSchema>["type"]; page: number; x: number; y: number; width: number; height: number; required: boolean; label?: string }

export type ApiSource =
  | { kind: "upload" }
  | { kind: "url"; url: string }
  | { kind: "base64"; data: string }
  | { kind: "template"; slug: string; values: Record<string, string> }
  | { kind: "saved"; id: string; values: Record<string, string> }

export type ApiSendInput = {
  title?: string
  message?: string
  expiresInDays: number | null
  signingOrder: "PARALLEL" | "SEQUENTIAL"
  source: ApiSource
  recipients: ApiRecipient[]
  /** null when none were given: the engine places them, or asks for them. */
  fields: ApiField[] | null
}

/** "recipients.0.email" from a zod issue path, so the integration can point at the input. */
const pathOf = (path: PropertyKey[]) => path.map(String).join(".")

/**
 * Reads a send request. `hasUpload` is true when the request was multipart
 * with a `file` part, which is then the source.
 */
export function parseSendInput(body: unknown, { hasUpload = false }: { hasUpload?: boolean } = {}): { ok: true; input: ApiSendInput } | { ok: false; problem: ApiProblem } {
  const parsed = sendSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, problem: { code: "invalid_input", message: `\`${pathOf(issue.path) || "body"}\` is not valid: ${issue.message}` } }
  }
  const b = parsed.data

  const sources = [hasUpload, b.file_url, b.file_base64, b.template, b.saved_template_id].filter(Boolean).length
  if (sources !== 1) {
    return { ok: false, problem: { code: "source", message: "Give exactly one of: a `file` upload, `file_url`, `file_base64`, `template` or `saved_template_id`." } }
  }
  const source: ApiSource = hasUpload
    ? { kind: "upload" }
    : b.file_url
      ? { kind: "url", url: b.file_url }
      : b.file_base64
        ? { kind: "base64", data: b.file_base64 }
        : b.template
          ? { kind: "template", slug: b.template, values: b.values }
          : { kind: "saved", id: b.saved_template_id!, values: b.values }

  const recipients: ApiRecipient[] = b.recipients.map((r, i) => ({
    email: r.email,
    name: r.name,
    role: r.role,
    // Without an order, people sign in the order they are listed.
    order: r.order ?? i,
    templateRole: r.template_role || undefined,
  }))

  let fields: ApiField[] | null = null
  if (b.fields && b.fields.length > 0) {
    if (source.kind === "template" || source.kind === "saved") {
      return { ok: false, problem: { code: "fields_with_template", message: "A template places its own fields; leave out `fields`." } }
    }
    fields = []
    for (const [i, f] of b.fields.entries()) {
      // "0" is a position too: form-style platforms send every number as text.
      const asIndex = typeof f.recipient === "number" ? f.recipient : /^\d+$/.test(f.recipient) ? Number(f.recipient) : null
      const index = asIndex ?? recipients.findIndex((r) => r.email === String(f.recipient).toLowerCase())
      if (index < 0 || index >= recipients.length) {
        return { ok: false, problem: { code: "invalid_input", message: `\`fields.${i}.recipient\` matches no recipient: use their position in \`recipients\` (from 0) or their email.` } }
      }
      if (f.x + f.width > 100.5 || f.y + f.height > 100.5) {
        return { ok: false, problem: { code: "invalid_input", message: `\`fields.${i}\` runs off the page: x + width and y + height are percentages of the page and must stay within 100.` } }
      }
      fields.push({ recipientIndex: index, type: f.type, page: f.page, x: f.x, y: f.y, width: f.width, height: f.height, required: f.required, label: f.label })
    }
  }

  return { ok: true, input: { title: b.title, message: b.message, expiresInDays: b.expires_in_days, signingOrder: b.signing_order, source, recipients, fields } }
}

/**
 * Who takes each of a template's roles. The sender's own role (`you`) is
 * theirs; every other role needs a recipient. A recipient naming a
 * `template_role` takes that role; the rest fill the remaining roles in the
 * order both are listed, so a one-signer template needs no role names at all.
 */
export function assignTemplateRoles(
  roles: { id: string; label: string; you: boolean }[],
  recipients: ApiRecipient[]
): { ok: true; byRole: Map<string, ApiRecipient> } | { ok: false; problem: ApiProblem } {
  const open = roles.filter((r) => !r.you)
  const byRole = new Map<string, ApiRecipient>()
  for (const r of recipients.filter((x) => x.templateRole)) {
    const role = roles.find((x) => x.id === r.templateRole)
    if (!role) return { ok: false, problem: { code: "template_roles", message: `\`${r.templateRole}\` is not one of this template's roles: ${open.map((x) => x.id).join(", ")}.` } }
    if (role.you) return { ok: false, problem: { code: "template_roles", message: `\`${role.id}\` is the sender's own role and is filled with the account's name and email.` } }
    if (byRole.has(role.id)) return { ok: false, problem: { code: "template_roles", message: `Two recipients take the role \`${role.id}\`.` } }
    byRole.set(role.id, r)
  }
  const rest = recipients.filter((x) => !x.templateRole)
  for (const role of open) {
    if (byRole.has(role.id)) continue
    const next = rest.shift()
    if (next) byRole.set(role.id, next)
  }
  const missing = open.filter((r) => !byRole.has(r.id))
  if (missing.length > 0 || rest.length > 0) {
    return { ok: false, problem: { code: "template_roles", message: `This template needs one recipient for each of: ${open.map((x) => x.id).join(", ")}.` } }
  }
  return { ok: true, byRole }
}

// ─── Finding documents ───────────────────────────────────────────────────────

/** The status names a request may use, mapped to the stored ones. "sent" and "declined" read as people say them. */
const STATUS_NAMES: Record<string, DocumentStatus> = {
  draft: "DRAFT",
  pending: "PENDING",
  sent: "PENDING",
  completed: "COMPLETED",
  rejected: "REJECTED",
  declined: "REJECTED",
  cancelled: "CANCELLED",
  canceled: "CANCELLED",
  expired: "EXPIRED",
}

export const LIST_LIMIT_DEFAULT = 25
export const LIST_LIMIT_MAX = 100

export type ListQuery = {
  statuses: DocumentStatus[] | null
  recipient: string | null
  title: string | null
  createdAfter: Date | null
  createdBefore: Date | null
  limit: number
  cursor: string | null
}

function dateParam(params: URLSearchParams, name: string): Date | null | ApiProblem {
  const raw = params.get(name)?.trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? { code: "invalid_input", message: `\`${name}\` is not a date: use ISO 8601, like 2026-10-25 or 2026-10-25T09:30:00Z.` } : d
}

export function parseListQuery(params: URLSearchParams): { ok: true; query: ListQuery } | { ok: false; problem: ApiProblem } {
  let statuses: DocumentStatus[] | null = null
  const rawStatus = params.get("status")?.trim()
  if (rawStatus) {
    const names = rawStatus.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    const unknown = names.find((n) => !STATUS_NAMES[n])
    if (unknown) return { ok: false, problem: { code: "invalid_input", message: `\`status\` "${unknown}" is not one of: draft, pending, completed, declined, cancelled, expired.` } }
    statuses = [...new Set(names.map((n) => STATUS_NAMES[n]))]
  }

  const after = dateParam(params, "created_after")
  if (after && !(after instanceof Date)) return { ok: false, problem: after }
  const before = dateParam(params, "created_before")
  if (before && !(before instanceof Date)) return { ok: false, problem: before }

  const rawLimit = params.get("limit")?.trim()
  const limit = rawLimit ? Number(rawLimit) : LIST_LIMIT_DEFAULT
  if (!Number.isInteger(limit) || limit < 1 || limit > LIST_LIMIT_MAX) {
    return { ok: false, problem: { code: "invalid_input", message: `\`limit\` must be a whole number from 1 to ${LIST_LIMIT_MAX}.` } }
  }

  return {
    ok: true,
    query: {
      statuses,
      recipient: params.get("recipient")?.trim().toLowerCase() || null,
      title: params.get("title")?.trim().slice(0, TITLE_MAX) || null,
      createdAfter: after,
      createdBefore: before,
      limit,
      cursor: params.get("cursor")?.trim().slice(0, 64) || null,
    },
  }
}

/**
 * The HTTP status for an engine error code (src/lib/esign). A plan limit is
 * 402, so an integration can tell "upgrade" from "fix the request".
 */
export function engineErrorStatus(code: string): number {
  if (code === "notFound" || code === "templateNotFound") return 404
  if (code === "rateLimited") return 429
  if (code.startsWith("plan_")) return 402
  if (code === "emailNotConfirmed" || code === "dailyLimit") return 403
  return 422
}
