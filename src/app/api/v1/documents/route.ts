/**
 * /api/v1/documents: sending documents and finding them, for integrations
 * (a Zapier or Make action "Send a document for signature", a search "Find
 * a document", a CRM sending a contract from a deal).
 *
 *   POST  create and send a document from a PDF or a template
 *         → 201 { ...document, recipients, undelivered, not_emailed }
 *   GET   this account's documents, newest first, filtered by status,
 *         recipient, title or creation date → { data, next_cursor }
 *
 * Thin like the server actions: authenticate (withApiKey), re-parse the
 * input (src/lib/api/documents.ts), apply the same burst limits the dashboard
 * uses, and hand the send to the engine (src/lib/esign/api-send.ts), which
 * takes the dashboard's own send path, so the same webhooks fire.
 */
import { NextResponse } from "next/server"
import { getTranslations } from "next-intl/server"
import { routing } from "@/i18n/routing"
import { apiError, jsonBody, withScope } from "@/lib/api/v1"
import { assignTemplateRoles, engineErrorStatus, parseListQuery, parseSendInput, type ApiSendInput } from "@/lib/api/documents"
import { getApiDocument, listApiDocuments } from "@/lib/api/documents-store"
import { fetchPdf } from "@/lib/api/fetch-file"
import { checkRateLimit } from "@/lib/rate-limit"
import { BURST_LIMITS } from "@/lib/esign/sending-limits"
import { MAX_PDF_BYTES, MAX_PDF_MB } from "@/lib/esign/limits"
import { MAX_RECIPIENTS, TITLE_MAX } from "@/lib/esign/schemas"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"
import { sendFromApi, type ApiSendArgs } from "@/lib/esign/api-send"
import { linkDocumentToRecord } from "@/lib/integrations/salesforce-store"
import { getSavedTemplate } from "@/lib/esign/templates"
import { findLibraryTemplate } from "@/lib/seo-agent/published-pages"
import type { ApiCaller } from "@/lib/api-keys-store"

export const dynamic = "force-dynamic"

/** The same buckets the dashboard's actions use, so the API is not a way around them. */
function underBurstLimit(kind: "send" | "upload", userId: string) {
  const { max, windowMs } = BURST_LIMITS[kind]
  return checkRateLimit(`esign:${kind}:${userId}`, max, windowMs)
}

/**
 * The engine's refusal as an API error. The message is the one the dashboard
 * shows for the same code (esign.errors), so both say the same thing.
 */
async function engineError(code: string) {
  if (code === "fieldsRequired") {
    return apiError(422, "fields_required", "Give `fields` for each signer: without them, a PDF can only be sent with every recipient a signer, in parallel.")
  }
  const t = await getTranslations({ locale: routing.defaultLocale, namespace: "esign.errors" })
  const message = t.has(code) ? t(code, { max: MAX_RECIPIENTS, maxMb: MAX_PDF_MB, free: FREE_DOCUMENTS_PER_MONTH }) : t("generic")
  return apiError(engineErrorStatus(code), code, message)
}

/** The body and, from a multipart request, the uploaded PDF. */
async function readRequest(request: Request): Promise<{ body: unknown; upload: Uint8Array | null; uploadName: string | null } | Response> {
  const type = request.headers.get("content-type") ?? ""
  if (!type.includes("multipart/form-data")) return { body: await jsonBody(request), upload: null, uploadName: null }
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return apiError(400, "invalid_body", "The multipart body could not be read.")
  }
  const file = form.get("file")
  const data = form.get("data")
  let body: unknown = null
  try {
    body = typeof data === "string" ? JSON.parse(data) : null
  } catch {
    body = null
  }
  if (!body) return apiError(400, "invalid_json", "Send the request's JSON as a `data` part beside the `file` part.")
  const upload = file instanceof File && file.size > 0 ? new Uint8Array(await file.arrayBuffer()) : null
  // Untitled, a document is named after its file, as an upload in the dashboard is.
  const uploadName = file instanceof File ? file.name.replace(/\.pdf$/i, "").trim() || null : null
  return { body, upload, uploadName }
}

/** The PDF the request points at: uploaded, base64 or a link. */
async function pdfFrom(input: ApiSendInput, upload: Uint8Array | null): Promise<Uint8Array | Response> {
  const { source } = input
  if (source.kind === "upload" && upload) return upload
  if (source.kind === "base64") {
    // Decoded size is about three quarters of the text; refuse before decoding a huge one.
    if (source.data.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 4) return engineError("TOO_LARGE")
    const bytes = Buffer.from(source.data.replace(/^data:[^,]*,/, ""), "base64")
    return new Uint8Array(bytes)
  }
  if (source.kind === "url") {
    const fetched = await fetchPdf(source.url)
    if (fetched.ok) return fetched.bytes
    if (fetched.error === "TOO_LARGE") return engineError("TOO_LARGE")
    if (fetched.error === "url") return apiError(422, "file_url", "`file_url` must be a public https URL.")
    return apiError(422, "file_url", `\`file_url\` could not be downloaded${fetched.detail ? ` (${fetched.detail})` : ""}.`)
  }
  return apiError(400, "source", "No file in the request.")
}

async function send(caller: ApiCaller, request: Request): Promise<Response> {
  const read = await readRequest(request)
  if (read instanceof Response) return read
  if (!read.body) return apiError(400, "invalid_json", "Send a JSON object.")
  const parsed = parseSendInput(read.body, { hasUpload: Boolean(read.upload) })
  if (!parsed.ok) return apiError(422, parsed.problem.code, parsed.problem.message)
  const input = parsed.input

  if (!(await underBurstLimit("send", caller.userId))) return engineError("rateLimited")
  if (!(await underBurstLimit("upload", caller.userId))) return engineError("rateLimited")

  const common = {
    userId: caller.userId,
    sender: { name: caller.name ?? "", email: caller.email },
    message: input.message,
    expiresInDays: input.expiresInDays,
    signingOrder: input.signingOrder,
    recipients: input.recipients,
  }
  let args: ApiSendArgs
  if (input.source.kind === "template" || input.source.kind === "saved") {
    let slug = input.source.kind === "template" ? input.source.slug : ""
    let values = input.source.values
    if (input.source.kind === "saved") {
      const saved = await getSavedTemplate(caller.userId, input.source.id)
      if (!saved) return apiError(404, "templateNotFound", "No saved template with that id on this account.")
      slug = saved.templateSlug
      // What the request gives wins over what was saved, blank by blank.
      values = { ...saved.values, ...values }
    }
    const template = (await findLibraryTemplate(slug))?.template
    if (!template) return apiError(404, "templateNotFound", "No template with that slug. GET /api/v1/templates lists them.")
    const roles = assignTemplateRoles(template.roles, input.recipients)
    if (!roles.ok) return apiError(422, roles.problem.code, roles.problem.message)
    args = { ...common, title: (input.title ?? template.h1).slice(0, TITLE_MAX), source: { kind: "template", template, values, byRole: roles.byRole } }
  } else {
    const bytes = await pdfFrom(input, read.upload)
    if (bytes instanceof Response) return bytes
    args = { ...common, title: (input.title ?? read.uploadName ?? "Untitled document").slice(0, TITLE_MAX), source: { kind: "pdf", bytes, fields: input.fields } }
  }

  const sent = await sendFromApi(args)
  if (!sent.ok) return engineError(sent.error)
  // Sent from a Salesforce record: kept, so its completion is written back there.
  if (input.salesforceRecordId) await linkDocumentToRecord(caller.userId, sent.documentId, input.salesforceRecordId)
  const document = await getApiDocument(caller.userId, sent.documentId)
  return NextResponse.json({ ...document, undelivered: sent.undelivered, not_emailed: sent.notEmailed }, { status: 201 })
}

export async function POST(request: Request) {
  return withScope("documents:send", request, (caller) => send(caller, request))
}

export async function GET(request: Request) {
  return withScope("documents:read", request, async (caller) => {
    const parsed = parseListQuery(new URL(request.url).searchParams)
    if (!parsed.ok) return apiError(422, parsed.problem.code, parsed.problem.message)
    const { data, nextCursor } = await listApiDocuments(caller.userId, parsed.query)
    return NextResponse.json({ data, next_cursor: nextCursor })
  })
}
