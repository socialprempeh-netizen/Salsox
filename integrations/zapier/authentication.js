/**
 * Connecting a Salsox account to Zapier: an API key, the same credential the
 * public API (/api/v1) takes from every client, sent as
 * `Authorization: Bearer <key>` by the middleware in lib/api.js.
 *
 * People create the key themselves in Salsox (Developers, then Create key),
 * with no need to contact support, as Zapier requires. The connection test
 * is GET /api/v1/me, which also names the connection by the account's email
 * address: never the key itself.
 */
const { BASE_URL, DEVELOPERS_URL } = require("./lib/api")

module.exports = {
  type: "custom",
  fields: [
    {
      key: "api_key",
      label: "API key",
      type: "password",
      required: true,
      helpText: `Create a key in Salsox under [Developers](${DEVELOPERS_URL}): select **Create key**, name it "Zapier", and paste it here. Keys start with \`ak_\`. Any Salsox plan can create one.`,
    },
  ],
  test: { url: `${BASE_URL}/me`, method: "GET" },
  // The test's response (GET /me) is bundle.inputData here.
  // No app name and no key in a label (Zapier's publishing requirement 5.6).
  connectionLabel: (z, bundle) => (bundle.inputData && (bundle.inputData.email || bundle.inputData.name)) || "",
}
