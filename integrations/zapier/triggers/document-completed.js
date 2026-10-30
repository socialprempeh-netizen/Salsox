/**
 * Instant trigger "New Completed Document": Salsox posts the `document.completed` webhook to the
 * Zap as soon as it happens. Built by lib/hook-trigger.js, like every
 * document trigger; the sample is Salsox's own sample of this event.
 * Also carries the signed PDF as a file (lib/files.js), so a Zap can save
 * it to Google Drive or attach it to an email.
 */
const { hookTrigger } = require("../lib/hook-trigger")
const { sampleEvent } = require("../lib/samples")

module.exports = hookTrigger({
  key: "document_completed",
  event: "document.completed",
  label: "New Completed Document",
  noun: "Document",
  description: "Triggers when every recipient has signed a document.",
  sample: sampleEvent("document.completed"),
  signedPdf: true,
})
