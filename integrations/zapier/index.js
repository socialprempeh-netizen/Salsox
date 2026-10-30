/**
 * The Salsox app for Zapier: the definition the Zapier Platform CLI uploads
 * (`zapier push`, from this folder). See README.md for what is in it, how to
 * test it and how it is published.
 *
 *  - Triggers (instant, REST hooks): a document sent, viewed, signed,
 *    completed (with the signed PDF as a file), declined or expired.
 *  - Actions: send a document from a template, or from a PDF.
 *  - Search: find a document by title, recipient or status.
 *
 * Everything goes through Salsox's public API (/api/v1) with the account's
 * API key; nothing here decides anything the API does not already decide.
 * No payment step: Zapier does not publish integrations that move money
 * (its publishing requirement 1.4), so Sign & Pay stays in Salsox.
 *
 * Kept free of zapier-platform-core at load time, so the repository's own
 * tests (test/*.test.mjs, run by `npm test` at the root) can load the whole
 * definition without this folder's dependencies installed.
 */
const { version, dependencies } = require("./package.json")
const authentication = require("./authentication")
const { addApiKey, handleErrors } = require("./lib/api")
const { signedPdf } = require("./lib/files")

const triggers = [
  require("./triggers/document-signed"),
  require("./triggers/document-completed"),
  require("./triggers/document-declined"),
  require("./triggers/document-viewed"),
  require("./triggers/document-sent"),
  require("./triggers/document-expired"),
  require("./triggers/template-list"),
]
const creates = [require("./creates/send-template"), require("./creates/send-pdf")]
const searches = [require("./searches/find-document")]

const byKey = (list) => Object.fromEntries(list.map((item) => [item.key, item]))

module.exports = {
  version,
  platformVersion: dependencies["zapier-platform-core"],
  authentication,
  // Input arrives as the person typed it, not coerced by the platform: the
  // steps trim and check it themselves (lib/pdf.js, lib/templates.js,
  // lib/search.js), so what is checked is what is sent.
  flags: { cleanInputData: false },
  beforeRequest: [addApiKey],
  afterResponse: [handleErrors],
  // The signed PDF, downloaded only when a step uses it (lib/files.js).
  hydrators: { signedPdf },
  triggers: byKey(triggers),
  creates: byKey(creates),
  searches: byKey(searches),
  // "Find or send": a Zap can look for the document first and send it only
  // when there is none yet (Zapier's find-or-create pattern).
  searchOrCreates: {
    find_document: {
      key: "find_document",
      display: { label: "Find or Send Document", description: "Finds a document, or sends one from a template when none is found." },
      search: "find_document",
      create: "send_template",
    },
  },
}
