/**
 * Tests for the Salsox Signing extension's rules
 * (extensions/salsox-signing/lib/fields.js). They live here because the test
 * runner reads src/; the module itself ships with the extension. The
 * request they build is checked against the API's own parser
 * (src/lib/api/documents.ts), so the extension cannot drift from what
 * POST /api/v1/documents accepts.
 */
import { describe, expect, it } from "vitest"
import { allowanceText, draftProblems, moveField, placeField, removeSigner, titleFromFileName, toApiRequest, upgradeBeforeSend, upgradeFromError } from "../../extensions/salsox-signing/lib/fields.js"
import { parseSendInput } from "./api/documents"

type Field = ReturnType<typeof placeField>
const draft = (over: Record<string, unknown> = {}) => ({
  title: "Lease",
  message: "",
  signingOrder: "PARALLEL",
  signers: [{ email: "ama@example.com", name: "Ama" }],
  fields: [placeField({ id: "f1", type: "SIGNATURE", signer: 0, page: 1, x: 50, y: 90 })] as Field[],
  ...over,
})
const free = (left: number) => ({ tier: "free", documents_left: left, documents_per_month: 3, features: { sequential_signing: false, sign_and_pay: false, approvers: false } })
const business = { tier: "business", documents_left: null, documents_per_month: null, features: { sequential_signing: true, sign_and_pay: true, approvers: true } }

describe("placing fields", () => {
  it("centres a new field on the click and keeps it on the page", () => {
    expect(placeField({ id: "a", type: "SIGNATURE", signer: 0, page: 2, x: 50, y: 50 })).toMatchObject({ x: 35, y: 47, width: 30, height: 6, page: 2 })
    const corner = placeField({ id: "b", type: "DATE", signer: 1, page: 1, x: 99, y: 99.5 })
    expect(corner.x + corner.width).toBeLessThanOrEqual(100)
    expect(corner.y + corner.height).toBeLessThanOrEqual(100)
    expect(placeField({ id: "c", type: "TEXT", signer: 0, page: 1, x: 0, y: 0 })).toMatchObject({ x: 0, y: 0 })
  })

  it("keeps a moved field on the page", () => {
    const f = placeField({ id: "a", type: "SIGNATURE", signer: 0, page: 1, x: 50, y: 50 })
    expect(moveField(f, -10, 120)).toMatchObject({ x: 0, y: 94 })
  })

  it("removes a signer's fields and renumbers the ones after", () => {
    const fields = [0, 1, 2].map((s) => placeField({ id: `f${s}`, type: "DATE", signer: s, page: 1, x: 50, y: 50 }))
    expect(removeSigner(fields, 1).map((f: Field) => [f.id, f.signer])).toEqual([["f0", 0], ["f2", 1]])
  })

  it("titles a document from its file name", () => {
    expect(titleFromFileName("Offer letter.PDF")).toBe("Offer letter")
    expect(titleFromFileName(".pdf")).toBe("Untitled document")
  })
})

describe("before sending", () => {
  it("asks for a field per signer and a valid, distinct email each", () => {
    expect(draftProblems(draft())).toEqual([])
    const two = draft({ signers: [{ email: "ama@example.com" }, { email: "AMA@example.com" }] })
    expect(draftProblems(two)).toEqual(["signerNoField:1", "duplicate:1"])
    expect(draftProblems(draft({ signers: [{ email: "nope" }], fields: [], title: " " }))).toEqual(["title", "noFields", "signerNoField:0", "email:0"])
  })

  it("builds a request the API's own parser accepts, fields pointing at their signer", () => {
    const d = draft({
      signers: [{ email: "Ama@Example.com", name: "Ama" }, { email: "kofi@example.com", name: "" }],
      fields: [placeField({ id: "a", type: "SIGNATURE", signer: 0, page: 1, x: 30, y: 80 }), { ...placeField({ id: "b", type: "TEXT", signer: 1, page: 2, x: 60, y: 40 }), label: "Job title" }],
      signingOrder: "SEQUENTIAL",
      message: "  Please sign  ",
    })
    const body = toApiRequest(d)
    expect(body).toMatchObject({ title: "Lease", message: "Please sign", signing_order: "sequential", recipients: [{ email: "ama@example.com", name: "Ama", order: 0 }, { email: "kofi@example.com", order: 1 }] })
    expect(body.fields[1]).toMatchObject({ recipient: 1, type: "TEXT", page: 2, label: "Job title" })
    const parsed = parseSendInput(body, { hasUpload: true })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.input.fields?.map((f) => f.recipientIndex)).toEqual([0, 1])
  })

  it("sends one signer in parallel whatever the switch says", () => {
    expect(toApiRequest(draft({ signingOrder: "SEQUENTIAL" })).signing_order).toBe("parallel")
  })
})

describe("upgrade prompts", () => {
  it("offers an upgrade before a send the plan would refuse", () => {
    expect(upgradeBeforeSend(free(0), draft())).toBe("limit")
    expect(upgradeBeforeSend(free(2), draft())).toBeNull()
    const ordered = draft({ signingOrder: "SEQUENTIAL", signers: [{ email: "a@example.com" }, { email: "b@example.com" }] })
    expect(upgradeBeforeSend(free(2), ordered)).toBe("sequential")
    expect(upgradeBeforeSend(business, ordered)).toBeNull()
    expect(upgradeBeforeSend(null, ordered)).toBeNull()
  })

  it("turns the server's plan refusals into the same prompts", () => {
    expect(upgradeFromError("plan_unlimitedDocuments")).toBe("limit")
    expect(upgradeFromError("plan_sequentialSigning")).toBe("sequential")
    expect(upgradeFromError("plan_signAndPay")).toBe("payment")
    expect(upgradeFromError("plan_approvers")).toBe("plan")
    expect(upgradeFromError("emailNotConfirmed")).toBeNull()
  })

  it("words the allowance", () => {
    expect(allowanceText(free(2))).toBe("Free plan: 2 of 3 free documents left this month")
    expect(allowanceText(business)).toBe("Business plan: unlimited documents")
  })
})
