/**
 * Instant trigger "New Document View": Salsox posts the `document.viewed` webhook to the
 * Zap as soon as it happens. Built by lib/hook-trigger.js, like every
 * document trigger; the sample is Salsox's own sample of this event.
 */
const { hookTrigger } = require("../lib/hook-trigger")
const { sampleEvent } = require("../lib/samples")

module.exports = hookTrigger({
  key: "document_viewed",
  event: "document.viewed",
  label: "New Document View",
  noun: "View",
  description: "Triggers when a recipient opens a document for the first time.",
  sample: sampleEvent("document.viewed"),
})
