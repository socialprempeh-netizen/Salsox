/**
 * The sample each trigger shows in Zapier's editor before the account has
 * any real events: the same shape and the same fictional document as
 * Salsox's own sample (samplePayload in src/lib/webhooks/payload.ts, served
 * at GET /api/v1/webhooks/sample), so the sample, the test step and a real
 * delivery all have the same keys. The test in test/samples.test.js keeps
 * them in step with that builder.
 */

const AT = "2026-10-29T10:00:00.000Z"
const minutesBefore = (m) => new Date(Date.parse(AT) - m * 60_000).toISOString()

function sampleEvent(event) {
  const signed = event === "document.signed" || event === "document.completed"
  const viewed = event !== "document.sent" && event !== "document.expired"
  const done = event === "document.completed"
  const declined = event === "document.declined"
  const ama = {
    id: "rcp_sample_ama",
    name: "Ama Mensah",
    email: "ama@example.com",
    role: "SIGNER",
    order: 0,
    status: signed ? "SIGNED" : declined ? "REJECTED" : "NOT_SIGNED",
    viewed_at: viewed ? minutesBefore(20) : null,
    signed_at: signed ? minutesBefore(5) : null,
    decline_reason: declined ? "The deposit amount is wrong." : null,
  }
  const kofi = {
    id: "rcp_sample_kofi",
    name: "Kofi Boateng",
    email: "kofi@example.com",
    role: "SIGNER",
    order: 1,
    status: done ? "SIGNED" : "NOT_SIGNED",
    viewed_at: done ? minutesBefore(10) : null,
    signed_at: done ? minutesBefore(1) : null,
    decline_reason: null,
  }
  const perRecipient = event === "document.viewed" || event === "document.signed" || event === "document.declined"
  return {
    id: "evt_sample",
    event,
    created_at: AT,
    test: true,
    data: {
      document: {
        id: "doc_sample_1a2b3c",
        title: "Service agreement",
        status: done ? "COMPLETED" : declined ? "REJECTED" : event === "document.expired" ? "EXPIRED" : "PENDING",
        created_at: minutesBefore(90),
        sent_at: minutesBefore(60),
        completed_at: done ? AT : null,
        page_count: 3,
        signing_order: "PARALLEL",
        url: "https://salsox.com/dashboard/documents/doc_sample_1a2b3c",
      },
      recipient: perRecipient ? ama : null,
      recipients: [ama, kofi],
      payment: null,
    },
  }
}

module.exports = { sampleEvent }
