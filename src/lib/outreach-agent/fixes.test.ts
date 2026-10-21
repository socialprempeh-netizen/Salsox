import { describe, expect, it } from "vitest"
import { answerable, fixFor, isComplaint, type Fix } from "./fixes"

const catalogue: Fix[] = [
  { id: "no-accounts", answers: ["signer-friction"], label: "No signer accounts", facts: "Signers need no account." },
  { id: "price", answers: ["pricing", "limits"], label: "Price", facts: "Paid plans send unlimited documents." },
  { id: "price-2", answers: ["pricing"], label: "Second price", facts: "Never chosen." },
]

describe("fixFor", () => {
  it("returns the first fix that answers the complaint", () => {
    expect(fixFor("pricing", catalogue)?.id).toBe("price")
    expect(fixFor("limits", catalogue)?.id).toBe("price")
    expect(fixFor("signer-friction", catalogue)?.id).toBe("no-accounts")
  })

  it("has no fix for a complaint the catalogue does not answer", () => {
    expect(fixFor("payments", catalogue)).toBeNull()
  })

  it("never answers 'other', even if a fix claims to", () => {
    expect(fixFor("other", [{ id: "x", answers: ["other"], label: "x", facts: "x" }])).toBeNull()
  })
})

describe("answerable", () => {
  it("lists the complaints with a fix, in catalogue-independent order", () => {
    expect(answerable(catalogue)).toEqual(["pricing", "limits", "signer-friction"])
  })
})

describe("isComplaint", () => {
  it("accepts known complaints only", () => {
    expect(isComplaint("mobile")).toBe(true)
    expect(isComplaint("support")).toBe(false)
  })
})
