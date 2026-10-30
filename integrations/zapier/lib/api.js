/**
 * How the Zapier integration talks to Salsox's public API (/api/v1): the
 * base URL, the request middleware that adds the API key, and the
 * translation of every refusal into words a non-technical person can act on.
 *
 * The API's own messages are written for developers (they name JSON fields
 * in backticks); a Zap's error is read by whoever built the Zap. So each
 * error code the API can return (src/lib/api/v1.ts, src/lib/api/documents.ts,
 * and the engine's codes in src/locales/en.json, esign.errors) maps to a
 * plain sentence here, and anything unforeseen is cleaned of field names.
 *
 * Which Zapier error each becomes follows Zapier's build guidelines:
 *  - a rejected API key: ExpiredAuthError (the Zap is paused and the user is
 *    emailed to reconnect, instead of failing on every run);
 *  - a plan limit (HTTP 402): HaltedError (a soft stop; the Zap stays on);
 *  - too many requests: ThrottledError (Zapier retries later);
 *  - everything else: Error, with the plain message.
 */

/** The production API. Fixed, not an environment variable: Zapier allows those only for authentication credentials. */
const BASE_URL = "https://salsox.com/api/v1"

/** Where people create an API key, linked from the connect screen and from errors. */
const DEVELOPERS_URL = "https://salsox.com/dashboard/developers"

/** Adds the API key to every request, and asks for JSON. */
function addApiKey(request, z, bundle) {
  request.headers = request.headers || {}
  if (bundle.authData && bundle.authData.api_key) request.headers.Authorization = `Bearer ${String(bundle.authData.api_key).trim()}`
  request.headers.Accept = "application/json"
  return request
}

/** Developer wording in an API message, made readable: no backticks, field names as the person sees them. */
const FIELD_NAMES = {
  file_url: "PDF",
  file_base64: "PDF",
  recipients: "signers",
  template_role: "role",
  template: "template",
  saved_template_id: "template",
  expires_in_days: "days until the link expires",
  title: "document title",
  message: "message",
  values: "template fields",
  limit: "number of results",
  status: "status",
}

function cleanMessage(message) {
  return String(message || "")
    .replace(/`([^`]+)`/g, (_, name) => FIELD_NAMES[name] || name.replace(/_/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * The plain message for a refusal, and the kind of Zapier error it should be.
 * Pure: takes the status and the parsed body, so it is tested without HTTP.
 */
function describeError(status, body) {
  const error = (body && body.error) || {}
  const code = error.code || ""
  const apiMessage = cleanMessage(error.message)

  if (status === 401) {
    return {
      kind: "auth",
      message: `Salsox did not accept your API key. It may have been deleted. Create a new key in Salsox under Developers (${DEVELOPERS_URL}), then reconnect your Salsox account in Zapier.`,
    }
  }
  if (status === 403 && code === "insufficient_scope") {
    return { kind: "auth", message: "This Salsox connection is not allowed to do that. Reconnect your Salsox account in Zapier with an API key." }
  }
  if (status === 429) return { kind: "throttled", message: "Salsox is receiving too many requests from this account. Zapier will try again in a minute." }
  if (status === 402) return { kind: "halted", message: apiMessage || "Your Salsox plan does not include this. Upgrade in Salsox under Billing, then turn the Zap back on." }
  if (status === 404) return { kind: "error", message: "That document or template no longer exists in Salsox. Choose another one in this step." }
  if (code === "file_url") {
    return { kind: "error", message: "Salsox could not download the PDF from that link. Check that the link opens a PDF without signing in, and that the file is 4 MB or smaller." }
  }
  if (code === "source") return { kind: "error", message: "Choose a template, or give a PDF to send." }
  if (code === "template_roles") return { kind: "error", message: `Fill in an email for every role this template needs. ${apiMessage}`.trim() }
  if (code === "invalid_body" || code === "invalid_json" || code === "invalid_input") {
    return { kind: "error", message: apiMessage ? `Some details in this step are not valid: ${apiMessage}` : "Some details in this step are not valid. Check the fields and try again." }
  }
  if (status >= 500) return { kind: "error", message: "Salsox had a problem on its side and could not finish this step. Zapier will show it as an error; try again in a few minutes." }
  // The engine's own refusals (unconfirmed email, daily limit, not a PDF,
  // too many recipients...) are already written for the person.
  return { kind: "error", message: apiMessage || `Salsox could not finish this step (error ${status}). Try again, and contact Salsox support if it keeps happening.` }
}

/** Raises a refusal as the right Zapier error, with its plain message. Unsubscribing may opt out (a hook already gone is fine). */
function handleErrors(response, z) {
  if (response.status < 400 || response.skipThrowForStatus || (response.request && response.request.skipThrowForStatus)) return response
  let body = response.data
  if (body === undefined) {
    try {
      body = JSON.parse(response.content)
    } catch {
      body = null
    }
  }
  const { kind, message } = describeError(response.status, body)
  if (kind === "auth") throw new z.errors.ExpiredAuthError(message)
  if (kind === "halted") throw new z.errors.HaltedError(message)
  if (kind === "throttled") throw new z.errors.ThrottledError(message, 60)
  throw new z.errors.Error(message, (body && body.error && body.error.code) || "SalsoxError", response.status)
}

module.exports = { BASE_URL, DEVELOPERS_URL, addApiKey, cleanMessage, describeError, handleErrors }
