/**
 * The Zapier app's definition as a whole (index.js): the steps it offers,
 * named the way Zapier's publishing checks ask, each with a sample and
 * labelled output, and the instant triggers behaving as REST hooks should.
 * `npx zapier-platform validate` in this folder runs Zapier's own checks;
 * these keep the same rules from slipping between runs of it.
 */
import { describe, expect, it } from "vitest"
import { fakeZ, load } from "./helpers.mjs"

const app = load("../index.js")
const visibleTriggers = Object.values(app.triggers).filter((t) => !t.display.hidden)

describe("Salsox Zapier app", () => {
  it("offers the triggers, actions and search the listing promises", () => {
    expect(Object.keys(app.triggers)).toEqual(expect.arrayContaining(["document_signed", "document_declined", "document_viewed", "document_completed", "document_sent", "document_expired"]))
    expect(Object.keys(app.creates)).toEqual(["send_template", "send_pdf"])
    expect(Object.keys(app.searches)).toEqual(["find_document"])
  })

  it("names every step the way Zapier's checks ask", () => {
    for (const t of visibleTriggers) {
      expect(t.display.label).toMatch(/^New [A-Z]/)
      expect(t.display.description).toMatch(/^Triggers when .+\.$/)
      expect(t.display.description).not.toMatch(/Salsox/)
    }
    for (const c of Object.values(app.creates)) expect(c.display.description).toMatch(/^[A-Z][a-z]+s .+\.$/)
    for (const s of Object.values(app.searches)) expect(s.display.description).toMatch(/^Finds .+\.$/)
    const labels = [...Object.values(app.triggers), ...Object.values(app.creates), ...Object.values(app.searches)].map((x) => x.display.label)
    for (const label of labels) expect(label.split(" ").every((word) => /^[A-Z0-9]/.test(word))).toBe(true)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it("gives every step a sample with an id, and labels for its output", () => {
    for (const step of [...Object.values(app.triggers), ...Object.values(app.creates), ...Object.values(app.searches)]) {
      expect(step.operation.sample.id).toBeTruthy()
      for (const field of step.operation.outputFields) expect(field.label).toBeTruthy()
    }
  })

  it("takes the API key from the connection, as a password field", () => {
    expect(app.authentication.type).toBe("custom")
    expect(app.authentication.fields).toEqual([expect.objectContaining({ key: "api_key", type: "password", required: true })])
    expect(app.authentication.connectionLabel(null, { inputData: { email: "ama@example.com", name: "Ama" } })).toBe("ama@example.com")
  })

  it("matches its platform version to the installed core", () => {
    expect(app.platformVersion).toBe(load("../package.json").dependencies["zapier-platform-core"])
  })
})

describe("instant triggers", () => {
  const trigger = app.triggers.document_signed.operation

  it("subscribes the Zap's own URL to one event, and unsubscribes it", async () => {
    const { z, requests } = fakeZ({ "POST /webhooks": { id: "wh_1" }, "DELETE /webhooks/wh_1": { status: 204, data: null } })
    expect(await trigger.performSubscribe(z, { targetUrl: "https://hooks.zapier.com/1/2" })).toEqual({ id: "wh_1" })
    expect(requests[0].body).toEqual({ target_url: "https://hooks.zapier.com/1/2", event: "document.signed" })
    expect(await trigger.performUnsubscribe(z, { subscribeData: { id: "wh_1" } })).toEqual({})
  })

  it("treats a subscription already removed in Salsox as unsubscribed", async () => {
    const { z } = fakeZ({ "DELETE /webhooks/wh_gone": { status: 404, data: { error: { code: "notFound" } } } })
    expect(await trigger.performUnsubscribe(z, { subscribeData: { id: "wh_gone" } })).toEqual({})
  })

  it("passes a delivery through as it came", async () => {
    const delivery = { id: "evt_1", event: "document.signed", data: {} }
    expect(await trigger.perform(null, { cleanedRequest: delivery })).toEqual([delivery])
  })

  it("shows the account's own recent events in the test step, up to 100", async () => {
    const { z, requests } = fakeZ({ "GET /events": [{ id: "evt_a_1" }, { id: "evt_a_2" }] })
    expect(await trigger.performList(z, {})).toEqual([{ id: "evt_a_1" }, { id: "evt_a_2" }])
    expect(requests[0].params).toEqual({ event: "document.signed", limit: 100 })
  })

  it("falls back to Salsox's sample when nothing has happened yet", async () => {
    const { z } = fakeZ({ "GET /events": [], "GET /webhooks/sample": [{ id: "evt_sample", test: true }] })
    expect(await trigger.performList(z, {})).toEqual([{ id: "evt_sample", test: true }])
  })
})

describe("signed PDF on a completed document", () => {
  const trigger = app.triggers.document_completed.operation

  it("adds the signed PDF as a file to a real event, and null to a sample", async () => {
    const real = { id: "evt_1", test: false, data: { document: { id: "doc_9" } } }
    expect((await trigger.perform(fakeZ().z, { cleanedRequest: real }))[0].signed_pdf).toBe('hydrate:signedPdf:{"document_id":"doc_9"}')
    const { z } = fakeZ({ "GET /events": [], "GET /webhooks/sample": [{ id: "evt_sample", test: true, data: { document: { id: "doc_sample" } } }] })
    expect((await trigger.performList(z, {}))[0].signed_pdf).toBeNull()
    expect(trigger.outputFields).toContainEqual({ key: "signed_pdf", label: "Signed PDF", type: "file" })
    expect(app.triggers.document_signed.operation.outputFields.map((f) => f.key)).not.toContain("signed_pdf")
  })

  it("downloads the signed version when a step uses the file", async () => {
    const stashed = []
    const { z, requests } = fakeZ({ "GET /documents/doc_9/pdf": { status: 200, data: null } })
    z.stashFile = async (response) => (stashed.push(response), "https://zapier.example/file.pdf")
    expect(await app.hydrators.signedPdf(z, { inputData: { document_id: "doc_9" } })).toBe("https://zapier.example/file.pdf")
    expect(requests[0]).toMatchObject({ params: { version: "signed" }, raw: true })
    expect(stashed).toHaveLength(1)
  })
})

describe("Template dropdown", () => {
  it("lists saved templates first, a page at a time", async () => {
    const data = Array.from({ length: 120 }, (_, i) => ({ slug: `t${i}`, title: `Template ${i}`, roles: [], variables: [] }))
    const { z } = fakeZ({ "GET /templates": { data, saved: [{ id: "s1", name: "My NDA", template: "t0" }] } })
    const first = await app.triggers.template_list.operation.perform(z, { meta: { page: 0 } })
    expect(first).toHaveLength(100)
    expect(first[0]).toEqual({ id: "saved:s1", name: "My NDA (saved template)" })
    const second = await app.triggers.template_list.operation.perform(z, { meta: { page: 1 } })
    expect(second).toHaveLength(21)
  })
})

describe("actions and search", () => {
  const templates = {
    data: [{ slug: "freelance-contract", title: "Freelance contract template", roles: [{ id: "freelancer", label: "Freelancer", sender: true }, { id: "client", label: "Client", sender: false }], variables: ["Client legal name", "Total fee"] }],
    saved: [],
  }

  it("Send Document From Template asks for the chosen template's signers and blanks", async () => {
    const { z } = fakeZ({ "GET /templates": templates })
    const dynamic = app.creates.send_template.operation.inputFields.find((f) => typeof f === "function")
    const fields = await dynamic(z, { inputData: { template: "library:freelance-contract" } })
    expect(fields.map((f) => f.label)).toEqual(["Client email", "Client name", "Client legal name", "Total fee"])
    expect(fields.every((f) => /^[a-z0-9_]+$/.test(f.key))).toBe(true)
  })

  it("Send Document From Template sends the template with its blanks filled", async () => {
    const { z, requests } = fakeZ({ "GET /templates": templates, "POST /documents": { id: "doc_1", title: "Freelance contract" } })
    const result = await app.creates.send_template.operation.perform(z, {
      inputData: { template: "library:freelance-contract", role_client_email: " kofi@example.com ", role_client_name: "Kofi", value_client_legal_name: "Harvest Table Ltd", value_total_fee: 12000 },
    })
    expect(result).toEqual({ id: "doc_1", title: "Freelance contract" })
    expect(requests[1].body).toEqual({
      template: "freelance-contract",
      values: { "Client legal name": "Harvest Table Ltd", "Total fee": "12000" },
      recipients: [{ email: "kofi@example.com", name: "Kofi", template_role: "client" }],
    })
  })

  it("Send Document From Template says so when the template has gone", async () => {
    const { z } = fakeZ({ "GET /templates": templates })
    await expect(app.creates.send_template.operation.perform(z, { inputData: { template: "library:deleted" } })).rejects.toThrow(/no longer available/)
  })

  it("Send Document From PDF sends the link with a signer per email", async () => {
    const { z, requests } = fakeZ({ "POST /documents": { id: "doc_2" } })
    await app.creates.send_pdf.operation.perform(z, { inputData: { file: "https://zapier-dev-files.s3.amazonaws.com/x.pdf", signer_emails: ["ama@example.com"], signer_names: ["Ama Mensah"] } })
    expect(requests[0].body).toEqual({ file_url: "https://zapier-dev-files.s3.amazonaws.com/x.pdf", recipients: [{ email: "ama@example.com", name: "Ama Mensah", role: "SIGNER" }] })
  })

  it("Find Document returns the matches, and an empty list when there are none", async () => {
    const found = fakeZ({ "GET /documents": { data: [{ id: "doc_3" }], next_cursor: null } })
    expect(await app.searches.find_document.operation.perform(found.z, { inputData: { recipient: "Ama@Example.com" } })).toEqual([{ id: "doc_3" }])
    expect(found.requests[0].params).toEqual({ recipient: "ama@example.com", limit: 1 })
    const none = fakeZ({ "GET /documents": { data: [], next_cursor: null } })
    expect(await app.searches.find_document.operation.perform(none.z, { inputData: { title: "NDA" } })).toEqual([])
  })
})
