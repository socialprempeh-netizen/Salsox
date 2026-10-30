/**
 * One instant (REST hook) trigger per Salsox webhook event, built the same
 * way for each, as Zapier's build guidelines ask:
 *
 *  - Subscribe: POST /api/v1/webhooks with the Zap's own URL and the one
 *    event, so two Zaps on the same trigger each get their own subscription.
 *  - Unsubscribe: DELETE /api/v1/webhooks/{id}. A subscription that is
 *    already gone (someone deleted it in Salsox) is not an error.
 *  - Perform: the delivery Salsox posted, as it came.
 *  - Perform list (the test step, and Zapier's polling fallback): the
 *    account's real recent events, newest first, up to 100, in exactly the
 *    shape a delivery has (GET /api/v1/events); for a new account with none
 *    yet, Salsox's sample of that event (GET /api/v1/webhooks/sample),
 *    marked `"test": true`.
 *
 * Every item has a unique `id`, which Zapier uses to avoid triggering twice.
 */
const { BASE_URL, describeError } = require("./api")
const { withSignedPdf, SAMPLE_SIGNED_PDF } = require("./files")

/** The fields people map most from an event, labelled; the rest come through under their own names. */
const eventOutputFields = [
  { key: "id", label: "Event ID" },
  { key: "event", label: "Event type" },
  { key: "created_at", label: "Event time", type: "datetime" },
  { key: "test", label: "Is sample data", type: "boolean" },
  { key: "data__document__id", label: "Document ID" },
  { key: "data__document__title", label: "Document title" },
  { key: "data__document__status", label: "Document status" },
  { key: "data__document__url", label: "Document link" },
  { key: "data__document__completed_at", label: "Document completed at", type: "datetime" },
  { key: "data__recipient__name", label: "Recipient name" },
  { key: "data__recipient__email", label: "Recipient email" },
  { key: "data__recipient__status", label: "Recipient status" },
  { key: "data__recipient__viewed_at", label: "Recipient viewed at", type: "datetime" },
  { key: "data__recipient__signed_at", label: "Recipient signed at", type: "datetime" },
  { key: "data__recipient__decline_reason", label: "Decline reason" },
]

/**
 * Names follow Zapier's conventions: "New <Noun>" in title case, a singular
 * noun (Zapier pluralises it), and a description starting "Triggers when".
 *
 * `signedPdf` adds the signed PDF as a file (lib/files.js), for the event
 * after which there is one: a completed document.
 */
function hookTrigger({ key, event, label, noun = "Document", description, sample, signedPdf = false }) {
  const finish = (z, items) => (signedPdf ? items.map((item) => withSignedPdf(z, item)) : items)

  const subscribe = async (z, bundle) => {
    const response = await z.request({ url: `${BASE_URL}/webhooks`, method: "POST", body: { target_url: bundle.targetUrl, event } })
    return response.data
  }

  const unsubscribe = async (z, bundle) => {
    const id = bundle.subscribeData && bundle.subscribeData.id
    if (!id) return {}
    const response = await z.request({ url: `${BASE_URL}/webhooks/${encodeURIComponent(id)}`, method: "DELETE", skipThrowForStatus: true })
    // Already removed in Salsox: nothing left to do.
    if (response.status === 404 || response.status < 400) return {}
    throw new z.errors.Error(describeError(response.status, response.data).message, "SalsoxError", response.status)
  }

  const perform = async (z, bundle) => finish(z, [bundle.cleanedRequest])

  const performList = async (z) => {
    const recent = await z.request({ url: `${BASE_URL}/events`, params: { event, limit: 100 } })
    if (Array.isArray(recent.data) && recent.data.length > 0) return finish(z, recent.data)
    const fallback = await z.request({ url: `${BASE_URL}/webhooks/sample`, params: { event } })
    return finish(z, Array.isArray(fallback.data) ? fallback.data : [])
  }

  return {
    key,
    noun,
    display: { label, description },
    operation: {
      type: "hook",
      performSubscribe: subscribe,
      performUnsubscribe: unsubscribe,
      perform,
      performList,
      sample: signedPdf ? { ...sample, signed_pdf: SAMPLE_SIGNED_PDF } : sample,
      outputFields: signedPdf ? [...eventOutputFields, { key: "signed_pdf", label: "Signed PDF", type: "file" }] : eventOutputFields,
    },
  }
}

module.exports = { hookTrigger, eventOutputFields }
