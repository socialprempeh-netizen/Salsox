/**
 * Instant trigger "New Expired Document": Salsox posts the `document.expired` webhook to the
 * Zap as soon as it happens. Built by lib/hook-trigger.js, like every
 * document trigger; the sample is Salsox's own sample of this event.
 */
const { hookTrigger } = require("../lib/hook-trigger")
const { sampleEvent } = require("../lib/samples")

module.exports = hookTrigger({
  key: "document_expired",
  event: "document.expired",
  label: "New Expired Document",
  noun: "Document",
  description: "Triggers when a document's signing links expire before everyone has signed.",
  sample: sampleEvent("document.expired"),
})
