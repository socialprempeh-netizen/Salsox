/**
 * Tests for the signing engine's template helpers (templates.ts): which
 * values are kept, and the recipients a template draft starts with.
 */
import { describe, expect, it } from "vitest"
import { cleanValues, templateRecipients } from "./templates"

describe("cleanValues", () => {
  it("keeps only the template's own variables, trimmed and capped", () => {
    const template = { variables: { "Client name": "x", Fee: "y" } }
    expect(cleanValues(template, { "Client name": "  Ama  ", Fee: "", Other: "ignored", Extra: 5 })).toEqual({ "Client name": "Ama" })
    expect(cleanValues(template, { Fee: "a".repeat(900) }).Fee).toHaveLength(500)
  })
})

describe("templateRecipients", () => {
  it("fills the sender's own role and leaves the others to be named", () => {
    const roles = [
      { id: "provider", label: "Provider", you: true },
      { id: "client", label: "Client", you: false },
    ]
    expect(templateRecipients({ roles }, { name: "Ama Mensah", email: "ama@example.com" })).toEqual([
      { roleId: "provider", name: "Ama Mensah", email: "ama@example.com", order: 0 },
      { roleId: "client", name: "Client", email: "", order: 1 },
    ])
  })
})
