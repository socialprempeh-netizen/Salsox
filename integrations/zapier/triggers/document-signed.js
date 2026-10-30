/**
 * Instant trigger "New Signature": Salsox posts the `document.signed` webhook to the
 * Zap as soon as it happens. Built by lib/hook-trigger.js, like every
 * document trigger; the sample is Salsox's own sample of this event.
 */
const { hookTrigger } = require("../lib/hook-trigger")
const { sampleEvent } = require("../lib/samples")

module.exports = hookTrigger({
  key: "document_signed",
  event: "document.signed",
  label: "New Signature",
  noun: "Signature",
  description: "Triggers when a recipient signs a document.",
  sample: sampleEvent("document.signed"),
})
