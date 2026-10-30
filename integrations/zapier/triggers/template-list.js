/**
 * The "Template" dropdown in "Send Document From Template": a hidden
 * trigger, never offered as a Zap's starting step, that lists what the
 * account can send from (GET /api/v1/templates). The account's saved
 * templates come first (they are the ones people customised), then the
 * template library. Each choice's id says which kind it is ("saved:<id>" or
 * "library:<slug>"), so the action knows which field to send.
 *
 * The API answers with every template at once; the library holds more than
 * a hundred, so the list is handed to Zapier a page at a time (Zapier asks
 * that large dropdowns paginate, and shows "Load more" for the next page).
 */
const { BASE_URL } = require("../lib/api")
const { pageOf, templateChoices } = require("../lib/templates")

module.exports = {
  key: "template_list",
  noun: "Template",
  display: { label: "New Template", description: "Triggers when a template is available to send. Used to fill the template dropdown.", hidden: true },
  operation: {
    canPaginate: true,
    perform: async (z, bundle) => pageOf(templateChoices((await z.request({ url: `${BASE_URL}/templates` })).data), bundle.meta && bundle.meta.page),
    sample: { id: "library:freelance-contract", name: "Freelance contract template" },
    outputFields: [
      { key: "id", label: "Template ID" },
      { key: "name", label: "Template name" },
    ],
  },
}
