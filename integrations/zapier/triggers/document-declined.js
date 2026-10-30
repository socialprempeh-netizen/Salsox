/**
 * Instant trigger "New Declined Document": Salsox posts the `document.declined` webhook to the
 * Zap as soon as it happens. Built by lib/hook-trigger.js, like every
 * document trigger; the sample is Salsox's own sample of this event.
 */
const { hookTrigger } = require("../lib/hook-trigger")
const { sampleEvent } = require("../lib/samples")

module.exports = hookTrigger({
  key: "document_declined",
  event: "document.declined",
  label: "New Declined Document",
  noun: "Document",
  description: "Triggers when a recipient declines to sign a document, with their reason.",
  sample: sampleEvent("document.declined"),
})
