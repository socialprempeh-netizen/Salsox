/**
 * Instant trigger "New Sent Document": Salsox posts the `document.sent` webhook to the
 * Zap as soon as it happens. Built by lib/hook-trigger.js, like every
 * document trigger; the sample is Salsox's own sample of this event.
 */
const { hookTrigger } = require("../lib/hook-trigger")
const { sampleEvent } = require("../lib/samples")

module.exports = hookTrigger({
  key: "document_sent",
  event: "document.sent",
  label: "New Sent Document",
  noun: "Document",
  description: "Triggers when a document is sent for signature.",
  sample: sampleEvent("document.sent"),
})
