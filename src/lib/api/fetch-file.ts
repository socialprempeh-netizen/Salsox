/**
 * Downloads the PDF an API request points at (`file_url` on POST
 * /api/v1/documents). Server only.
 *
 * Integration platforms hand files over as links: Zapier's file fields are
 * URLs that redirect to storage, Make's likewise. Fetching a URL someone else
 * chose is the same risk as delivering a webhook to one, so it runs under the
 * same rules (src/lib/webhooks): https only, every address checked at connect
 * time so nothing inside a private network can be reached, ten seconds per
 * request. Redirects are followed, a few at most, and each hop is checked
 * again as if it had been given first. The body is read only up to the PDF
 * size limit, so a large file costs no more than that to refuse.
 */
import { fetch } from "undici"
import { agent } from "@/lib/webhooks/deliver"
import { checkWebhookUrl } from "@/lib/webhooks/url-safety"
import { MAX_PDF_BYTES } from "@/lib/esign/limits"

const TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

export type FetchFileError = "url" | "unreachable" | "status" | "TOO_LARGE"

export async function fetchPdf(raw: string): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: FetchFileError; detail?: string }> {
  let url = raw
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const checked = checkWebhookUrl(url, { allowLocalHttp: process.env.NODE_ENV === "development" })
    if (!checked.ok) return { ok: false, error: "url", detail: checked.problem }
    let res
    try {
      res = await fetch(checked.url, { dispatcher: agent, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/pdf" } })
    } catch {
      return { ok: false, error: "unreachable" }
    }
    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {})
      const next = res.headers.get("location")
      if (!next) return { ok: false, error: "status", detail: String(res.status) }
      url = new URL(next, checked.url).toString()
      continue
    }
    if (res.status < 200 || res.status >= 300 || !res.body) {
      await res.body?.cancel().catch(() => {})
      return { ok: false, error: "status", detail: String(res.status) }
    }
    const declared = Number(res.headers.get("content-length"))
    if (declared > MAX_PDF_BYTES) {
      await res.body.cancel().catch(() => {})
      return { ok: false, error: "TOO_LARGE" }
    }
    const chunks: Uint8Array[] = []
    let size = 0
    try {
      for await (const chunk of res.body) {
        size += chunk.byteLength
        if (size > MAX_PDF_BYTES) {
          await res.body.cancel().catch(() => {})
          return { ok: false, error: "TOO_LARGE" }
        }
        chunks.push(chunk)
      }
    } catch {
      return { ok: false, error: "unreachable" }
    }
    return { ok: true, bytes: new Uint8Array(Buffer.concat(chunks)) }
  }
  return { ok: false, error: "status", detail: "too many redirects" }
}
