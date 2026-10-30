/**
 * A Salsox document as the actions and the search return it: the API's own
 * document resource (src/lib/api/documents-store.ts), unchanged, so a Zap
 * maps an action's output and a trigger's `data.document` the same way.
 *
 * Zapier asks for a realistic sample with only the keys every response has,
 * clear labels for anything abbreviated or coded, and ISO 8601 dates; the
 * API already returns dates that way. The people and the document here are
 * fictional.
 */

const documentSample = {
  id: "cmh2x8r4k0001ab12cd34ef56",
  title: "Website design agreement",
  status: "PENDING",
  created_at: "2026-10-29T09:12:04.000Z",
  sent_at: "2026-10-29T09:12:05.000Z",
  completed_at: null,
  page_count: 3,
  signing_order: "PARALLEL",
  url: "https://salsox.com/dashboard/documents/cmh2x8r4k0001ab12cd34ef56",
  recipients: [
    {
      id: "cmh2x8r4n0002ab12cd34ef56",
      name: "Kofi Boateng",
      email: "kofi.boateng@example.com",
      role: "SIGNER",
      order: 0,
      status: "NOT_SIGNED",
      viewed_at: null,
      signed_at: null,
      decline_reason: null,
    },
  ],
}

/** Labels for the fields people map most, and the ones whose values are codes. */
const documentOutputFields = [
  { key: "id", label: "Document ID" },
  { key: "title", label: "Document title" },
  { key: "status", label: "Status (PENDING, COMPLETED, REJECTED, EXPIRED, CANCELLED or DRAFT)" },
  { key: "url", label: "Document link" },
  { key: "created_at", label: "Created at", type: "datetime" },
  { key: "sent_at", label: "Sent at", type: "datetime" },
  { key: "completed_at", label: "Completed at", type: "datetime" },
  { key: "page_count", label: "Number of pages", type: "integer" },
  { key: "signing_order", label: "Signing order (PARALLEL or SEQUENTIAL)" },
  { key: "recipients[]email", label: "Recipient emails" },
  { key: "recipients[]name", label: "Recipient names" },
  { key: "recipients[]status", label: "Recipient statuses" },
]

module.exports = { documentSample, documentOutputFields }
