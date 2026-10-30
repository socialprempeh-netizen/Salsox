/**
 * Action "Send Document From Template": sends one of the account's saved
 * templates, or a template from the Salsox library, to the people a Zap
 * names, with the template's blanks filled from earlier steps (a form
 * response, a CRM deal, a spreadsheet row). POST /api/v1/documents.
 *
 * Choosing a template reloads the step with that template's own fields: an
 * email and a name for each role that signs, then one field per blank
 * (lib/templates.js). Templates have their signature fields placed already,
 * so roles, signing order and approvers work as they do in Salsox.
 *
 * No payment fields: Zapier does not publish integrations that take
 * payments, so Sign & Pay stays in Salsox itself.
 */
const { BASE_URL } = require("../lib/api")
const { documentSample, documentOutputFields } = require("../lib/document")
const { parseChoice, templateBody, templateFields, templateFor } = require("../lib/templates")

/** The chosen template, read again from the API (its roles and blanks may have changed since the Zap was built). */
async function chosenTemplate(z, bundle) {
  const choice = parseChoice(bundle.inputData.template)
  if (!choice) return null
  const response = await z.request({ url: `${BASE_URL}/templates` })
  return templateFor(choice, response.data)
}

module.exports = {
  key: "send_template",
  noun: "Document",
  display: {
    label: "Send Document From Template",
    description: "Sends a document for signature from one of your templates, with its blanks filled in.",
  },
  operation: {
    inputFields: [
      {
        key: "template",
        label: "Template",
        required: true,
        dynamic: "template_list.id.name",
        altersDynamicFields: true,
        helpText: "Your saved templates are listed first, then the Salsox template library.",
      },
      async (z, bundle) => templateFields(await chosenTemplate(z, bundle)),
      { key: "title", label: "Document title", type: "string", required: false, helpText: "Leave empty to use the template's name." },
      { key: "message", label: "Message to signers", type: "text", required: false, helpText: "Shown in the invitation email, above the link to sign." },
      { key: "expires_in_days", label: "Days until the link expires", type: "integer", required: false, helpText: "Between 1 and 365. Leave empty to use your account's setting." },
    ],
    perform: async (z, bundle) => {
      const template = await chosenTemplate(z, bundle)
      if (!template) throw new z.errors.Error("That template is no longer available in Salsox. Choose another template in this step.", "TemplateMissing", 404)
      const body = templateBody(bundle.inputData, template)
      if (body.recipients.length === 0) throw new z.errors.Error("Fill in at least one signer's email for this template.", "NoRecipients", 400)
      const response = await z.request({ url: `${BASE_URL}/documents`, method: "POST", body })
      return response.data
    },
    sample: documentSample,
    outputFields: documentOutputFields,
  },
}
