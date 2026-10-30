/**
 * Search "Find Document": the account's most recent document matching a
 * title, a recipient's email or a status (GET /api/v1/documents, newest
 * first). Lets a Zap look up a document by something a person knows, as
 * Zapier asks, instead of typing an id: "has Ama signed the NDA yet?", or
 * the document to attach to a CRM record.
 *
 * Nothing found is an empty list, not an error (Zapier's search rule): the
 * Zap then follows its own "if nothing is found" setting.
 */
const { BASE_URL } = require("../lib/api")
const { documentSample, documentOutputFields } = require("../lib/document")
const { searchParams } = require("../lib/search")

module.exports = {
  key: "find_document",
  noun: "Document",
  display: {
    label: "Find Document",
    description: "Finds the most recent document matching a title, a recipient's email or a status.",
  },
  operation: {
    inputFields: [
      { key: "title", label: "Document title", type: "string", required: false, helpText: "Part of the title is enough. Fill in at least one of the title or the recipient email." },
      { key: "recipient", label: "Recipient email", type: "string", required: false, helpText: "Someone the document was sent to." },
      {
        key: "status",
        label: "Status",
        type: "string",
        required: false,
        choices: { pending: "Waiting for signatures", completed: "Completed", declined: "Declined", expired: "Expired", cancelled: "Cancelled", draft: "Draft" },
        helpText: "Leave empty to find a document in any status.",
      },
    ],
    perform: async (z, bundle) => {
      const { params, problem } = searchParams(bundle.inputData)
      if (problem) throw new z.errors.Error(problem, "InvalidInput", 400)
      const response = await z.request({ url: `${BASE_URL}/documents`, params })
      return response.data && Array.isArray(response.data.data) ? response.data.data : []
    },
    sample: documentSample,
    outputFields: documentOutputFields,
  },
}
