/**
 * The signed PDF as a file a Zap can pass on: "New Completed Document"
 * carries a `signed_pdf` field that Google Drive, Dropbox, Gmail and the
 * rest accept as an attachment.
 *
 * It is a Zapier "hydrator": the trigger hands over a pointer, and Zapier
 * runs `signedPdf` only when a later step uses the file, downloading it from
 * GET /api/v1/documents/{id}/pdf?version=signed with the connection's key
 * and storing it for that step. A Zap that never uses the file never
 * downloads it. Sample events (`test: true`) have no file behind them, so
 * their `signed_pdf` is null.
 */
const { BASE_URL } = require("./api")

/** Run by Zapier when a step uses the file. */
async function signedPdf(z, bundle) {
  const id = encodeURIComponent(bundle.inputData.document_id)
  const response = await z.request({ url: `${BASE_URL}/documents/${id}/pdf`, params: { version: "signed" }, raw: true })
  return z.stashFile(response)
}

/** An event with its `signed_pdf` pointer added (null for a sample). */
function withSignedPdf(z, event) {
  const id = event && event.data && event.data.document && event.data.document.id
  if (!id || event.test) return { ...event, signed_pdf: null }
  return { ...event, signed_pdf: z.dehydrateFile(signedPdf, { document_id: id }) }
}

/** What the editor shows for the field before a real event. */
const SAMPLE_SIGNED_PDF = "https://zapier.com/engine/hydrate/1/abc123/signed-pdf"

module.exports = { signedPdf, withSignedPdf, SAMPLE_SIGNED_PDF }
