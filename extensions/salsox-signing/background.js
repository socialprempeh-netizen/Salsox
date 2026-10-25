/**
 * Salsox Signing: the background worker. Everything that must outlive the
 * popup runs here, because a popup closes the moment it loses focus:
 *
 * - connect: chrome.identity.launchWebAuthFlow opens SERVER/extension/connect
 *   in a window sharing the browser's session; the page answers with an API
 *   key (or why not) in the redirect's fragment. A person who is not signed
 *   in gets the ordinary sign-in page in a tab and presses Connect again.
 * - send: the PDF and the draft from storage, as one multipart request to
 *   POST /api/v1/documents, the same path the API's documentation describes.
 * - refresh: the account and plan, from GET /api/v1/me.
 * - disconnect: DELETE /api/v1/keys/current, then everything stored is
 *   forgotten.
 *
 * State lives in chrome.storage.local, which the popup watches: `auth` (the
 * key, never shown), `account` (email, name, plan), `draft` (the PDF and its
 * fields), `job` (a send in progress or its result), `notice` (a connect
 * outcome to explain). Nothing is sent anywhere but SERVER.
 */
import { SERVER } from "./config.js"
import { toApiRequest } from "./lib/fields.js"

const get = async (key) => (await chrome.storage.local.get(key))[key]
const set = (values) => chrome.storage.local.set(values)

/** A call to the API with the stored key. A 401 means the key is gone: forget it. */
async function api(path, init = {}) {
  const auth = await get("auth")
  if (!auth?.key) return { status: 401, body: null }
  const response = await fetch(`${SERVER}/api/v1${path}`, { ...init, credentials: "omit", headers: { authorization: `Bearer ${auth.key}`, ...init.headers } })
  const body = response.status === 204 ? null : await response.json().catch(() => null)
  if (response.status === 401) {
    await chrome.storage.local.remove(["auth", "account"])
    await set({ notice: { kind: "expired" } })
  }
  return { status: response.status, body }
}

async function refresh() {
  const { status, body } = await api("/me")
  if (status === 200 && body) await set({ account: { email: body.email, name: body.name, plan: body.plan, at: Date.now() } })
  return status
}

async function connect() {
  await chrome.storage.local.remove("notice")
  let result
  try {
    const redirectUri = chrome.identity.getRedirectURL("connected")
    result = await chrome.identity.launchWebAuthFlow({ url: `${SERVER}/extension/connect?redirect_uri=${encodeURIComponent(redirectUri)}`, interactive: true })
  } catch {
    // The window was closed, or the page could not load.
    await set({ notice: { kind: "closed" } })
    return
  }
  const params = new URLSearchParams(new URL(result).hash.slice(1))
  const key = params.get("key")
  if (key) {
    await set({ auth: { key } })
    const status = await refresh()
    if (status !== 200) await set({ notice: { kind: "failed" } })
    return
  }
  const error = params.get("error") ?? "failed"
  // Signed out: the ordinary sign-in page, where every way of signing in works.
  if (error === "signed_out") await chrome.tabs.create({ url: `${SERVER}/login` })
  // Held by the sign-in policy: the dashboard shows the setup it requires.
  if (error === "setup_required") await chrome.tabs.create({ url: `${SERVER}/dashboard` })
  await set({ notice: { kind: error } })
}

const fromBase64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

async function send() {
  const draft = await get("draft")
  if (!draft?.pdf) return
  await set({ job: { phase: "sending", at: Date.now() } })
  try {
    const form = new FormData()
    form.set("file", new Blob([fromBase64(draft.pdf)], { type: "application/pdf" }), draft.fileName || "document.pdf")
    form.set("data", JSON.stringify(toApiRequest(draft)))
    const { status, body } = await api("/documents", { method: "POST", body: form })
    if (status === 201 && body) {
      await set({ job: { phase: "sent", document: { id: body.id, title: body.title, url: body.url, recipients: body.recipients?.map((r) => r.email) ?? [] }, undelivered: body.undelivered ?? 0, notEmailed: body.not_emailed ?? 0 } })
      await chrome.storage.local.remove("draft")
    } else {
      await set({ job: { phase: "error", status, code: body?.error?.code ?? null, message: body?.error?.message ?? null } })
    }
  } catch {
    await set({ job: { phase: "error", status: 0, code: "network", message: null } })
  }
  // The allowance changed, or the refusal may have been about it.
  await refresh().catch(() => {})
}

async function disconnect() {
  // Ends the key on the server too; forgotten here whatever the answer.
  await api("/keys/current", { method: "DELETE" }).catch(() => {})
  await chrome.storage.local.clear()
}

const HANDLERS = { connect, send, refresh, disconnect }

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  const handler = HANDLERS[message?.type]
  if (!handler) return false
  handler()
    .catch(() => {})
    .finally(() => reply({ ok: true }))
  return true
})
