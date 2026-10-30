/**
 * Action "Send Document From PDF": sends a PDF for signature from a link or
 * a file from an earlier step (Google Drive, Gmail, Dropbox, a form upload).
 * POST /api/v1/documents with `file_url`, which Salsox downloads over https
 * (following the redirects Zapier's file links use; PDFs up to 4 MB).
 *
 * A Zap cannot say where on the page each person signs, so this is Quick
 * Send: every signer gets a signature and a date field placed for them, and
 * everyone signs at the same time. Signing order, approvers and copies need
 * fields placed by hand and are left to "Send Document From Template".
 * No payment fields (Zapier does not publish integrations that take payments).
 */
const { BASE_URL } = require("../lib/api")
const { documentSample, documentOutputFields } = require("../lib/document")
const { pdfBody } = require("../lib/pdf")

module.exports = {
  key: "send_pdf",
  noun: "Document",
  display: {
    label: "Send Document From PDF",
    description: "Sends a PDF for signature, with a signature and a date placed for each signer.",
  },
  operation: {
    inputFields: [
      {
        key: "file",
        label: "PDF",
        type: "file",
        required: true,
        helpText: "A PDF from an earlier step, such as Google Drive or Gmail, or a link to a PDF that opens without signing in. Up to 4 MB.",
      },
      { key: "signer_emails", label: "Signer emails", type: "string", list: true, required: true, helpText: "One email per signer. Everyone signs at the same time." },
      { key: "signer_names", label: "Signer names", type: "string", list: true, required: false, helpText: "In the same order as the emails. Leave empty to use the email addresses." },
      { key: "title", label: "Document title", type: "string", required: false, helpText: "Leave empty to use the file's name." },
      { key: "message", label: "Message to signers", type: "text", required: false, helpText: "Shown in the invitation email, above the link to sign." },
      { key: "expires_in_days", label: "Days until the link expires", type: "integer", required: false, helpText: "Between 1 and 365. Leave empty to use your account's setting." },
    ],
    perform: async (z, bundle) => {
      const { body, problem } = pdfBody(bundle.inputData)
      if (problem) throw new z.errors.Error(problem, "InvalidInput", 400)
      const response = await z.request({ url: `${BASE_URL}/documents`, method: "POST", body })
      return response.data
    },
    sample: documentSample,
    outputFields: documentOutputFields,
  },
}
